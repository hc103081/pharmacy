import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// 測試前啟動
beforeAll(() => server.listen());

// 每個測試後重置 handlers
afterEach(() => server.resetHandlers());

// 所有測試結束後關閉
afterAll(() => server.close());