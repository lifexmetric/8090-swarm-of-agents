import { loadConfig } from "../config.js";
import { migrate, openDatabase } from "../db/database.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
migrate(db);
db.close();

console.log(`SQLite ready at ${config.databasePath}`);
