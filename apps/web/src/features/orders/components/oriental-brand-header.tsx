import Image from "next/image";

export function OrientalBrandHeader() {
  return (
    <div
      className="paper-brand paper-factory-brand"
      aria-label="ترويسة مصنع الحذاء الشرقي للمنتجات الجلدية"
    >
      <div className="paper-factory-brand-side paper-factory-ar">
        <Image
          src="/brand/oriental-arabic.png"
          alt=""
          className="paper-factory-brand-img paper-factory-brand-ar"
          width={704}
          height={358}
          unoptimized
          loading="eager"
          decoding="sync"
        />
        <div className="sr-only">
          <strong>الحذاء الشرقي</strong>
          <span>للمنتجات الجلدية</span>
          <span>س.ت ٤٠٣٠١٥٥٢٢٦ - غ.ت ١٠٤٦٦٤</span>
        </div>
      </div>

      <div className="paper-factory-logo-wrap">
        <Image
          src="/brand/oriental-logo.png"
          alt="شعار مصنع الحذاء الشرقي"
          className="paper-factory-logo"
          width={302}
          height={362}
          unoptimized
          loading="eager"
          decoding="sync"
        />
      </div>

      <div className="paper-factory-brand-side paper-factory-en">
        <Image
          src="/brand/oriental-english.png"
          alt=""
          className="paper-factory-brand-img paper-factory-brand-en"
          width={777}
          height={424}
          unoptimized
          loading="eager"
          decoding="sync"
        />
        <div className="sr-only">
          <small>ORIENTAL SHOE Est.</small>
          <span>For Leather Products</span>
          <span>C.R 4030155226 - C.C 104664</span>
        </div>
      </div>
    </div>
  );
}
