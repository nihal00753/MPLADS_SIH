import { app } from './app';
import { dataService } from './services/dataService';
import { initQueueSystem } from './services/queue';

const PORT = parseInt(process.env.PORT || '5000', 10);

async function bootstrap() {
  try {
    console.log('================================================================');
    console.log('  MPLADS AI/ML Intelligence Platform — Node.js/Express Backend');
    console.log('================================================================');

    // 1. Initialize dataService with real datasets from test_data/
    await dataService.initialize();

    // 2. Initialize BullMQ SLA monitoring queue
    initQueueSystem();

    // 3. Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Express API listening on http://0.0.0.0:${PORT}`);
      console.log(`[Server] Health check available at http://localhost:${PORT}/api/health`);
      console.log(`[Server] Auth endpoint available at http://localhost:${PORT}/api/auth/login`);
      console.log('================================================================');
    });
  } catch (err) {
    console.error('[Server] Fatal bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap();
