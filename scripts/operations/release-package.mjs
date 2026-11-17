import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ReleaseFailure, assertResourceOwnership } from "./release-config.mjs";
import {
  checkedCommand,
  runMetadataCommand,
  observeDeployment,
  sourceIdentity,
  inspectImage,
  assertCleanupTarget,
} from "./operation-runtime.mjs";
import { parsePackageRecord } from "./operations-records.mjs";
/** @typedef {import('./operation-runtime.mjs').OperationContext} OperationContext */
/** @typedef {import('./operations-records.mjs').PackageRecord} PackageRecord */
/** @param {OperationContext} context */
export async function packageRelease(context) {
  await observeDeployment(context);
  const lease = await context.files.acquireLock();
  try {
    const record = await buildPackageUnderLease(context);
    return Object.freeze({
      runId: context.runId,
      action: "package",
      phase: "PACKAGED",
      outcome: "COMPLETED_NAMED_OPERATION",
      evidenceReference: `${context.paths.packages}/${record.revision}.json`,
    });
  } finally {
    await lease.release();
  }
}
/** @param {OperationContext} context @returns {Promise<PackageRecord>} */
export async function buildPackageUnderLease(context) {
  await context.files.assertLock();
  const observation = await observeDeployment(context);
  const buildId = randomUUID();
  const imageReference = `${context.projectName}-app:${context.config.releaseRevision}-${buildId}`;
  let attempted = false,
    published = false,
    publicationAttempted = false;
  try {
    const source = await sourceIdentity(context);
    const references = [
      context.config.nodeImage,
      context.config.postgresImage,
      context.config.caddyImage,
    ];
    const bases = [];
    for (const reference of references)
      bases.push({ reference, ...(await inspectImage(context, reference)) });
    if (new Set(bases.map((base) => base.architecture)).size !== 1)
      throw new ReleaseFailure("RELEASE_TARGET_MISMATCH", "image-architecture");
    await observeDeployment(context);
    attempted = true;
    await checkedCommand(context, {
      executable: "docker",
      argv: [
        "build",
        "--file",
        `${context.paths.release}/deploy/Dockerfile`,
        "--build-arg",
        `NODE_IMAGE=${context.config.nodeImage}`,
        "--build-arg",
        `NEXT_PUBLIC_API_URL=https://${context.config.appDomain}/api/v1`,
        "--build-arg",
        `RELEASE_REVISION=${source.revision}`,
        "--label",
        `io.oriental-shoes.scope=${context.scope}`,
        "--label",
        `io.oriental-shoes.run=${context.runId}`,
        "--label",
        `io.oriental-shoes.build=${buildId}`,
        "--label",
        "io.oriental-shoes.role=application-image",
        "--label",
        `com.docker.compose.project=${context.projectName}`,
        "--label",
        `io.oriental-shoes.environment=${context.config.environmentId}`,
        "--tag",
        imageReference,
        context.paths.release,
      ],
      stage: "package-build",
      timeoutMs: 1800000,
    });
    const application = await inspectImage(context, imageReference);
    if (application.architecture !== bases[0]?.architecture)
      throw new ReleaseFailure(
        "RELEASE_TARGET_MISMATCH",
        "application-architecture",
      );
    await verifyPackagedImage(context, application.id);
    if (
      JSON.stringify(await sourceIdentity(context)) !== JSON.stringify(source)
    )
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "source-changed");
    await observeDeployment(context);
    const packageRecord = parsePackageRecord({
      version: 1,
      scope: context.scope,
      environmentId: context.config.environmentId,
      projectName: context.projectName,
      runId: context.runId,
      buildId,
      imageReference,
      packagedAt: new Date().toISOString(),
      ...source,
      publicApiOrigin: `https://${context.config.appDomain}/api/v1`,
      applicationImageId: application.id,
      architecture: application.architecture,
      bases,
      machineEngineObservation: observation,
    });
    await mkdir(context.paths.packages, { recursive: true, mode: 0o700 });
    const recordPath = `${context.paths.packages}/${source.revision}.json`;
    publicationAttempted = true;
    await context.files.writeJson(recordPath, packageRecord);
    published = true;
    return packageRecord;
  } catch (failure) {
    if (publicationAttempted && !published)
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "package-publication",
      );
    throw failure;
  } finally {
    if (attempted && !published && !publicationAttempted)
      await cleanupUnpublishedImage(context, { imageReference, buildId });
  }
}

/** @param {OperationContext} context @param {string} image */
async function verifyPackagedImage(context, image) {
  const program = `
    import fs from 'node:fs';import path from 'node:path';
    const forbidden=[];let origin=false;
    function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      if(entry.name==='node_modules')continue;
      const filename=path.join(directory,entry.name);
      if(entry.isDirectory()){if(['src','test-support','tests','e2e','docs'].includes(entry.name))forbidden.push(filename);else walk(filename);}
      else{if(entry.name.startsWith('.env')||entry.name.endsWith('.map')||/\\.(test|spec)\\./u.test(entry.name)||entry.name==='seed.ts')forbidden.push(filename);
        if(filename.includes('/.next/static/')&&filename.endsWith('.js')&&fs.readFileSync(filename,'utf8').includes(${JSON.stringify(`https://${context.config.appDomain}/api/v1`)}))origin=true;}
    }}
    for(const directory of ['/workspace/apps/api','/workspace/packages/contracts','/workspace/packages/database','/workspace/web/apps/web'])walk(directory);
    if(forbidden.length||!origin)process.exit(1);
    for(const filename of ['/workspace/apps/api/dist/server.js','/workspace/apps/api/dist/app.js','/workspace/packages/contracts/dist/index.js','/workspace/packages/database/dist/index.js','/workspace/packages/database/prisma.config.ts','/workspace/web/apps/web/server.js'])fs.accessSync(filename);
    if(process.getuid()===0)process.exit(1);
    await import('argon2');await import('@template/contracts');await import('@template/database');
    console.log('PACKAGED_RUNTIME_VERIFIED');
  `;
  await observeDeployment(context);
  const name = `${context.projectName}-verifier-${context.runId}`;
  /** @type {string|null} */ let id = null;
  try {
    id = (
      await checkedCommand(context, {
        executable: "docker",
        argv: [
          "create",
          "--name",
          name,
          "--network",
          "none",
          "--label",
          `io.oriental-shoes.environment=${context.config.environmentId}`,
          "--label",
          "io.oriental-shoes.scope=isolated",
          "--label",
          `io.oriental-shoes.run=${context.runId}`,
          "--label",
          "io.oriental-shoes.role=package-verifier",
          "--label",
          `com.docker.compose.project=${context.projectName}`,
          "--workdir",
          "/workspace/apps/api",
          image,
          "node",
          "--input-type=module",
          "-e",
          program,
        ],
        stage: "package-verifier-create",
      })
    ).trim();
    if (!/^[0-9a-f]{64}$/u.test(id))
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "package-verifier-id",
      );
    await verifyVerifierOwnership(context, id, image, context.deadline);
    const output = await checkedCommand(context, {
      executable: "docker",
      argv: ["start", "--attach", id],
      stage: "package-verifier-run",
    });
    const exit = (
      await checkedCommand(context, {
        executable: "docker",
        argv: ["inspect", "--format", "{{.State.ExitCode}}", id],
        stage: "package-verifier-status",
      })
    ).trim();
    if (exit !== "0" || output.trim() !== "PACKAGED_RUNTIME_VERIFIED")
      throw new ReleaseFailure("RELEASE_CHECK_FAILED", "packaged-runtime");
  } finally {
    const captured = id ?? (await reconcileVerifierId(context, name));
    if (captured !== null)
      await cleanupPackageVerifier(context, captured, image);
  }
}

/** @param {OperationContext} context @param {string} name */
async function reconcileVerifierId(context, name) {
  const response = await runMetadataCommand(
    {
      executable: "docker",
      argv: [
        "ps",
        "-a",
        "--no-trunc",
        "--filter",
        `name=^/${name}$`,
        "--format",
        "{{.ID}}",
      ],
      stage: "package-verifier-reconcile",
    },
    { environment: context.toolEnvironment, deadline: Date.now() + 30000 },
  );
  if (response.exitCode !== 0)
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "package-verifier-reconcile",
    );
  const id = response.stdout.trim();
  if (id === "") return null;
  if (!/^[0-9a-f]{64}$/u.test(id))
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "package-verifier-reconcile",
    );
  return id;
}

/** @param {OperationContext} context @param {string} id @param {string} image @param {number} deadline */
async function verifyVerifierOwnership(context, id, image, deadline) {
  const execution = { environment: context.toolEnvironment, deadline };
  await assertCleanupTarget(context, deadline);
  const inspection = await runMetadataCommand(
    {
      executable: "docker",
      argv: ["inspect", "--format", "{{json .Config.Labels}}\n{{.Image}}", id],
      stage: "package-verifier-owner",
    },
    execution,
  );
  const lines = inspection.stdout.trim().split("\n");
  if (inspection.exitCode !== 0 || lines.length !== 2 || lines[1] !== image)
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "package-verifier-owner",
    );
  const labels = JSON.parse(lines[0] ?? "null");
  if (
    typeof labels !== "object" ||
    labels === null ||
    Array.isArray(labels) ||
    !Object.values(labels).every((entry) => typeof entry === "string")
  )
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "package-verifier-owner",
    );
  assertResourceOwnership(
    { id, labels },
    {
      environmentId: context.config.environmentId,
      projectName: context.projectName,
      scope: "isolated",
      role: "package-verifier",
      runId: context.runId,
    },
  );
}

/** @param {OperationContext} context @param {string} id @param {string} image */
async function cleanupPackageVerifier(context, id, image) {
  const deadline = Date.now() + 30000;
  try {
    await verifyVerifierOwnership(context, id, image, deadline);
    const removal = await runMetadataCommand(
      {
        executable: "docker",
        argv: ["rm", "-f", "-v", id],
        stage: "package-verifier-cleanup",
      },
      { environment: context.toolEnvironment, deadline },
    );
    if (removal.exitCode !== 0)
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "package-verifier-cleanup",
      );
  } catch {
    throw new ReleaseFailure(
      "RELEASE_STATE_UNCERTAIN",
      "package-verifier-cleanup",
    );
  }
}

/** @param {OperationContext} context @param {Readonly<{imageReference:string,buildId:string}>} candidate */
async function cleanupUnpublishedImage(context, candidate) {
  const deadline = Date.now() + 30000;
  const execution = { environment: context.toolEnvironment, deadline };
  try {
    await assertCleanupTarget(context, deadline);
    const listing = await runMetadataCommand(
      {
        executable: "docker",
        argv: [
          "image",
          "ls",
          "--no-trunc",
          "--filter",
          `reference=${candidate.imageReference}`,
          "--format",
          "{{.ID}}",
        ],
        stage: "failed-image-observation",
      },
      execution,
    );
    if (listing.exitCode !== 0)
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "failed-image-observation",
      );
    const id = listing.stdout.trim();
    if (id === "") return;
    if (!/^sha256:[0-9a-f]{64}$/u.test(id))
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "failed-image-identity",
      );
    const inspected = await runMetadataCommand(
      {
        executable: "docker",
        argv: [
          "image",
          "inspect",
          "--format",
          "{{json .Config.Labels}}\n{{json .RepoTags}}",
          id,
        ],
        stage: "failed-image-owner",
      },
      execution,
    );
    const lines = inspected.stdout.trim().split("\n");
    if (inspected.exitCode !== 0 || lines.length !== 2)
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "failed-image-owner");
    const labels = JSON.parse(lines[0] ?? "null"),
      tags = JSON.parse(lines[1] ?? "null");
    if (
      typeof labels !== "object" ||
      labels === null ||
      Array.isArray(labels) ||
      !Object.values(labels).every((entry) => typeof entry === "string") ||
      !Array.isArray(tags) ||
      tags.length !== 1 ||
      tags[0] !== candidate.imageReference ||
      labels["io.oriental-shoes.run"] !== context.runId ||
      labels["io.oriental-shoes.build"] !== candidate.buildId ||
      labels["org.opencontainers.image.revision"] !==
        context.config.releaseRevision
    )
      throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "failed-image-owner");
    assertResourceOwnership(
      { id, labels },
      {
        environmentId: context.config.environmentId,
        projectName: context.projectName,
        scope: context.scope,
        role: "application-image",
        runId: context.runId,
      },
    );
    const removed = await runMetadataCommand(
      {
        executable: "docker",
        argv: ["image", "rm", id],
        stage: "failed-image-cleanup",
      },
      execution,
    );
    if (removed.exitCode !== 0)
      throw new ReleaseFailure(
        "RELEASE_STATE_UNCERTAIN",
        "failed-image-cleanup",
      );
  } catch {
    throw new ReleaseFailure("RELEASE_STATE_UNCERTAIN", "failed-image-cleanup");
  }
}
