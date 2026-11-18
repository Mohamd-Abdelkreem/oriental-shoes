import Image from "next/image";

export const ORIENTAL_LOGO_SRC = "/brand/oriental-logo.png";

export function OrientalLogo({ className }: { className: string | undefined }) {
  return (
    <Image
      src={ORIENTAL_LOGO_SRC}
      alt=""
      width={56}
      height={67}
      className={className}
    />
  );
}
