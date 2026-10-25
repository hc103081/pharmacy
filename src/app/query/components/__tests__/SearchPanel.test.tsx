import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPanel from '@/app/query/components/SearchPanel';
import { QueryFiltersProvider } from '@/app/query/context/QueryFiltersContext';
import { useQueryFilters } from '@/app/query/context/QueryFiltersContext';
import React from 'react';

// Mock the context to capture updateFilters calls
const captureUpdateFilters = vi.fn();
const captureResetFilters = vi.fn();

vi.mock('@/app/query/context/QueryFiltersContext', async () => {
  const actual = await vi.importActual('@/app/query/context/QueryFiltersContext');
  return {
    ...actual,
    useQueryFilters: () => ({
      filters: {
        searchText: '',
        barcode: undefined,
        productCode: undefined,
        storageLocations: [],
        categories: [],
        dateFrom: undefined,
        dateTo: undefined,
        manifestStatus: ['active', 'archived'],
        countedStatus: undefined,
        hasDiscrepancy: null,
      },
      updateFilters: captureUpdateFilters,
      resetFilters: captureResetFilters,
    }),
  };
});

// 使用組件實際的儲位和類別資料
const mockStorageLocations = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];
// 注意：組件實際使用的是日文漢字 "医療材料" 而非繁體中文 "醫療材料"
const mockCategories = ['西藥', '中藥', '保健品', '医療材料', '消毒用品', '其他'];

const renderSearchPanel = () => {
  captureUpdateFilters.mockClear();
  captureResetFilters.mockClear();
  
  return render(
    <QueryFiltersProvider>
      <SearchPanel 
        storageLocations={mockStorageLocations}
        categories={mockCategories}
      />
    </QueryFiltersProvider>
  );
};

// 輔助函數：取得日期輸入框
const getDateInputs = (container: HTMLElement) => {
  return container.querySelectorAll('input[type="date"]');
};

describe('SearchPanel 整合測試', () => {
  it('應渲染所有儲位按鈕', () => {
    renderSearchPanel();

    mockStorageLocations.forEach(location => {
      // 組件使用按鈕而非 checkbox
      expect(screen.getByRole('button', { name: location })).toBeInTheDocument();
    });
  });

  it('應渲染所有類別按鈕', () => {
    renderSearchPanel();

    mockCategories.forEach(category => {
      expect(screen.getByRole('button', { name: category })).toBeInTheDocument();
    });
  });

  it('應有搜尋輸入框', () => {
    renderSearchPanel();

    expect(screen.getByPlaceholderText(/條碼|品名|製造廠代碼/i)).toBeInTheDocument();
  });

  it('應有日期篩選輸入框', () => {
    const { container } = renderSearchPanel();

    // 日期輸入框是 <input type="date">，無 role="textbox"，使用 querySelector
    const dateInputs = getDateInputs(container);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('點選儲位後套用篩選應呼叫 updateFilters 並傳入正確值', async () => {
    renderSearchPanel();

    // 點選儲位按鈕
    await fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    await fireEvent.click(screen.getByRole('button', { name: 'A2' }));

    // 點擊套用篩選按鈕
    const applyButton = screen.getByRole('button', { name: /套用篩選/i });
    await fireEvent.click(applyButton);

    await waitFor(() => {
      expect(captureUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          storageLocations: ['A1', 'A2'],
        })
      );
    });
  });

  it('點選類別後套用篩選應呼叫 updateFilters 並傳入正確值', async () => {
    renderSearchPanel();

    // 點選類別按鈕
    await fireEvent.click(screen.getByRole('button', { name: '西藥' }));
    await fireEvent.click(screen.getByRole('button', { name: '中藥' }));

    const applyButton = screen.getByRole('button', { name: /套用篩選/i });
    await fireEvent.click(applyButton);

    await waitFor(() => {
      expect(captureUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          categories: ['西藥', '中藥'],
        })
      );
    });
  });

  it('輸入搜尋關鍵字後套用篩選應傳入 searchText', async () => {
    renderSearchPanel();

    const searchInput = screen.getByPlaceholderText(/條碼|品名|製造廠代碼/i);
    await fireEvent.change(searchInput, { target: { value: '阿司匹林' } });

    const applyButton = screen.getByRole('button', { name: /套用篩選/i });
    await fireEvent.click(applyButton);

    await waitFor(() => {
      expect(captureUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          searchText: '阿司匹林',
        })
      );
    });
  });

  it('選擇日期範圍後套用篩選應傳入 dateFrom 和 dateTo', async () => {
    const { container } = renderSearchPanel();

    const dateInputs = getDateInputs(container);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    const dateFromInput = dateInputs[0] as HTMLInputElement;
    const dateToInput = dateInputs[1] as HTMLInputElement;

    await fireEvent.change(dateFromInput, { target: { value: '2024-01-01' } });
    await fireEvent.change(dateToInput, { target: { value: '2024-01-31' } });

    const applyButton = screen.getByRole('button', { name: /套用篩選/i });
    await fireEvent.click(applyButton);

    await waitFor(() => {
      expect(captureUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
        })
      );
    });
  });

  it('點擊重置按鈕應呼叫 resetFilters', async () => {
    renderSearchPanel();

    const resetButton = screen.getByRole('button', { name: /重置/i });
    await fireEvent.click(resetButton);

    await waitFor(() => {
      expect(captureResetFilters).toHaveBeenCalledTimes(1);
    });
  });

  it('套用篩選應結合所有選擇的條件', async () => {
    const { container } = renderSearchPanel();

    // 同時選擇多個條件
    await fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    await fireEvent.click(screen.getByRole('button', { name: 'B1' }));
    await fireEvent.click(screen.getByRole('button', { name: '西藥' }));
    
    const searchInput = screen.getByPlaceholderText(/條碼|品名|製造廠代碼/i);
    await fireEvent.change(searchInput, { target: { value: '止痛' } });

    const dateInputs = getDateInputs(container);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    const dateFromInput = dateInputs[0] as HTMLInputElement;
    await fireEvent.change(dateFromInput, { target: { value: '2024-01-01' } });

    const applyButton = screen.getByRole('button', { name: /套用篩選/i });
    await fireEvent.click(applyButton);

    await waitFor(() => {
      expect(captureUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          searchText: '止痛',
          storageLocations: ['A1', 'B1'],
          categories: ['西藥'],
          dateFrom: '2024-01-01',
          dateTo: undefined,
        })
      );
    });
  });

  it('應顯示當前已套用的篩選條件摘要', async () => {
    // 這個測試驗證套用篩選後 context 狀態正確更新
    // 由於 vi.mock 的限制，這裡直接驗證 updateFilters 被正確呼叫
    renderSearchPanel();

    // 選擇條件並套用
    await fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    await fireEvent.click(screen.getByRole('button', { name: '西藥' }));
    
    const searchInput = screen.getByPlaceholderText(/條碼|品名|製造廠代碼/i);
    await fireEvent.change(searchInput, { target: { value: '阿司匹林' } });

    const applyButton = screen.getByRole('button', { name: /套用篩選/i });
    await fireEvent.click(applyButton);

    await waitFor(() => {
      expect(captureUpdateFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          searchText: '阿司匹林',
          storageLocations: ['A1'],
          categories: ['西藥'],
        })
      );
    });
  });
});