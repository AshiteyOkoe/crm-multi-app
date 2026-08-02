import express from 'express';
import cors from 'cors';
import routes from './routes';
import { notFoundHandler, errorHandler } from './middleware/error';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
