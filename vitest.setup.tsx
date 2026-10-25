import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { server } from '@/mocks/server';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/query',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/image.jpg' } }),
      }),
    },
  }),
}));

// Mock Supabase SSR
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
    },
  }),
}));

// Note: react-query is NOT mocked globally to allow tests to use real QueryClient
// Tests that need mocking should use vi.mock in individual test files

// Mock date-fns
vi.mock('date-fns', () => ({
  format: vi.fn((date, formatStr) => new Date(date).toISOString().split('T')[0]),
  formatDistanceToNow: vi.fn(() => '幾秒前'),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const icons = [
    'Search', 'Bell', 'TrendingUp', 'Upload', 'XCircle', 'Loader2',
    'AlertTriangle', 'CircleHelp', 'Filter', 'X', 'ChevronDown',
    'Calendar', 'CalendarDays', 'CheckSquare', 'Trash2', 'Download',
    'FileText', 'Eye', 'Clock', 'CheckCircle2', 'BarChart2',
    'Activity', 'TrendingUp', 'Download', 'RefreshCw', 'MoreHorizontal',
    'Settings', 'User', 'LogOut', 'Menu', 'X', 'ChevronLeft', 'ChevronRight',
    'Home', 'Package', 'Scan', 'Search', 'Filter', 'X', 'Plus', 'Minus',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'RefreshCw',
    'AlertCircle', 'CheckCircle', 'Info', 'HelpCircle', 'ExternalLink',
    'Copy', 'Edit', 'Delete', 'Save', 'Cancel', 'Confirm', 'Close',
    'Minimize', 'Maximize', 'RotateCcw', 'RotateCw', 'ZoomIn', 'ZoomOut',
  ];
  
  const mockIcons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {};
  icons.forEach(name => {
    mockIcons[name] = (props) => (
      <svg {...props} data-testid={`icon-${name.toLowerCase()}`} />
    );
  });
  
  return mockIcons;
});

// Suppress console.error for expected errors
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      args[0]?.includes?.('act(...)') ||
      args[0]?.includes?.('Warning:') ||
      args[0]?.includes?.('supabase')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});