import fs from "node:fs";
import crypto from "node:crypto";

const map = {
  qwen: "qwen",
  moonshot: "kimi",
  zhipu: "zhipu",
  doubao: "volcengine",
  siliconflow: "siliconcloud",
  minimax: "minimax",
  baichuan: "baichuan",
  stepfun: "stepfun",
  lingyiwanwu: "yi",
  hunyuan: "hunyuan",
  qianfan: "baidu",
  spark: "spark",
};

for (const [slug, icon] of Object.entries(map)) {
  const asset = `ui/public/brands/apps/${slug}.svg`;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(asset)).digest("hex");
  const doc = {
    reviewedAt: "2026-10-20",
    asset,
    sourceUrl: `https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/${icon}-color.svg`,
    sha256,
    license: "ui/public/brands/apps/LOBE-LICENSE",
    notes:
      icon === slug
        ? "Original Lobe Icons artwork, copied without modification. Structural safety checked by check-app-brand-assets."
        : `Original Lobe Icons ${icon} artwork mapped to the ${slug} vendor preset.`,
  };
  fs.writeFileSync(`doc/connections/${slug}-brand-provenance.json`, `${JSON.stringify(doc, null, 2)}\n`);
}
