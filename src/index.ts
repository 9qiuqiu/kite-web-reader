import 'dotenv/config';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const server = createApp(config).listen(config.port, () => {
  console.log(`Kite Web Reader listening on :${config.port} (${config.network}, $${config.price}/request)`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
