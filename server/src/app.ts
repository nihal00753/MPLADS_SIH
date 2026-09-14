import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import alertsRoutes from './routes/alerts';
import worksRoutes from './routes/works';
import notificationsRoutes from './routes/notifications';
import mlRoutes from './routes/ml';
import dashboardsRoutes from './routes/dashboards';
import citizenRoutes from './routes/citizen';

dotenv.config();

export const app = express();

app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'MPLADS AI/ML Node.js/Express Backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/dashboards', dashboardsRoutes);
app.use('/api/citizen', citizenRoutes);

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

export default app;
