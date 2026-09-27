import { mysqlOne } from "./src/lib/mysql.server";

async function main() {
  try {
    const res = await mysqlOne("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_owned_products'");
    console.log(res);
  } catch(e) {
    console.error(e);
  }
}
main();
