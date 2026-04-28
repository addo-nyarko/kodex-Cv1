import { db } from "@/lib/db";

// DEV ONLY — wipes all user data so you can start fresh (e.g. after clearing Supabase auth users)
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    // Use raw SQL to truncate all tables, bypassing FK constraints
    await db.$executeRawUnsafe(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP
          EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
        END LOOP;
      END $$;
    `);

    return Response.json({ ok: true, message: "All data wiped" });
  } catch (error) {
    console.error("Reset DB error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
