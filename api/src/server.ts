import { loadConfig } from "./config.js";
import { AtlasRepository, migrate, openDatabase } from "./db/database.js";
import { buildApp } from "./server/app.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
migrate(db);

const repository = new AtlasRepository(db);
repository.ensureWorkspace(config.workspaceId);

const app = await buildApp({ config, repository });

await app.listen({ host: config.host, port: config.port });
