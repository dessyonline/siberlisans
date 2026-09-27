import { rawCall } from "./src/lib/mysql.server";

async function main() {
  try {
    const res = await rawCall(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'auth_email_verifications'
    `, true);
    console.log("auth_email_verifications columns:", res.rows);
  } catch(e) {
    console.error(e);
  }
}
main();
