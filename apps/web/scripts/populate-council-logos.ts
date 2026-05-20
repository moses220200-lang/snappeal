import postgres from "postgres";

const LOGOS: Record<string, { logoUrl: string; logoBg?: string }> = {
  westminster: {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/City_of_westminster_logo.svg/250px-City_of_westminster_logo.svg.png",
    logoBg: "#ffffff",
  },
  "kensington-chelsea": {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/9/92/Rb_kensington_and_chelsea_logo.svg/250px-Rb_kensington_and_chelsea_logo.svg.png",
    logoBg: "#ffffff",
  },
  camden: {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/5/57/Lb_camden_logo.svg/250px-Lb_camden_logo.svg.png",
    logoBg: "#ffffff",
  },
  lambeth: {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/d/d8/Lb_lambeth_logo.svg/250px-Lb_lambeth_logo.svg.png",
    logoBg: "#ffffff",
  },
  islington: {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/d/d5/IslingtonCouncil.svg/250px-IslingtonCouncil.svg.png",
    logoBg: "#ffffff",
  },
  tfl: {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/TfL_roundel_%28no_text%29.svg/250px-TfL_roundel_%28no_text%29.svg.png",
    logoBg: "#ffffff",
  },
  "city-of-london": {
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Coat_of_Arms_of_The_City_of_London.svg/250px-Coat_of_Arms_of_The_City_of_London.svg.png",
    logoBg: "#ffffff",
  },
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    for (const [slug, { logoUrl, logoBg }] of Object.entries(LOGOS)) {
      const result = await sql`
        UPDATE councils
        SET logo_url = ${logoUrl}, logo_bg = ${logoBg ?? "#ffffff"}, updated_at = now()
        WHERE slug = ${slug}
        RETURNING slug, name, logo_url
      `;
      if (result.length === 0) {
        console.warn(`! ${slug} — not in DB (skipped)`);
      } else {
        console.log(`✓ ${slug} — ${result[0].name}`);
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
