import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryFiltersProvider, useQueryFilters } from '@/app/query/context/QueryFiltersContext';
import { DrugSearchFilters } from '@/types/query';

const TestComponent = () => {
  const { filters, updateFilters, resetFilters } = useQueryFilters();
  return (
    <div>
      <span data-testid="search-text">{filters.searchText}</span>
      <span data-testid="storage-locations">{JSON.stringify(filters.storageLocations)}</span>
      <span data-testid="categories">{JSON.stringify(filters.categories)}</span>
      <span data-testid="date-from">{filters.dateFrom || 'undefined'}</span>
      <span data-testid="date-to">{filters.dateTo || 'undefined'}</span>
      <span data-testid="manifest-status">{JSON.stringify(filters.manifestStatus)}</span>
      <span data-testid="counted-status">{filters.countedStatus || 'undefined'}</span>
      <span data-testid="has-discrepancy">{filters.hasDiscrepancy !== null ? String(filters.hasDiscrepancy) : 'null'}</span>
      <button onClick={() => updateFilters({ searchText: 'aspirin' })} data-testid="update-btn">
        Update
      </button>
      <button onClick={() => updateFilters({ storageLocations: ['A區', 'B區'] })} data-testid="update-locations-btn">
        Update Locations
      </button>
      <button onClick={resetFilters} data-testid="reset-btn">Reset</button>
    </div>
  );
};

describe('QueryFiltersContext', () => {
  const renderWithProvider = () => {
    return render(
      <QueryFiltersProvider>
        <TestComponent />
      </QueryFiltersProvider>
    );
  };

  it('應提供預設篩選值', () => {
    renderWithProvider();

    expect(screen.getByTestId('search-text')).toHaveTextContent('');
    expect(screen.getByTestId('storage-locations')).toHaveTextContent('[]');
    expect(screen.getByTestId('categories')).toHaveTextContent('[]');
    expect(screen.getByTestId('date-from')).toHaveTextContent('undefined');
    expect(screen.getByTestId('date-to')).toHaveTextContent('undefined');
    expect(screen.getByTestId('manifest-status')).toHaveTextContent('["active","archived"]');
    expect(screen.getByTestId('counted-status')).toHaveTextContent('undefined');
    expect(screen.getByTestId('has-discrepancy')).toHaveTextContent('null');
  });

  it('updateFilters 應更新指定欄位並保留其他欄位', () => {
    renderWithProvider();

    fireEvent.click(screen.getByTestId('update-btn'));

    expect(screen.getByTestId('search-text')).toHaveTextContent('aspirin');
    // 其他欄位應保持預設值
    expect(screen.getByTestId('storage-locations')).toHaveTextContent('[]');
    expect(screen.getByTestId('manifest-status')).toHaveTextContent('["active","archived"]');
  });

  it('updateFilters 應支援多欄位同時更新', () => {
    renderWithProvider();

    fireEvent.click(screen.getByTestId('update-locations-btn'));

    expect(screen.getByTestId('storage-locations')).toHaveTextContent('["A區","B區"]');
    expect(screen.getByTestId('search-text')).toHaveTextContent(''); // 未變更的欄位保持原值
  });

  it('resetFilters 應恢復所有預設值', () => {
    renderWithProvider();

    // 先更新一些值
    fireEvent.click(screen.getByTestId('update-btn'));
    fireEvent.click(screen.getByTestId('update-locations-btn'));

    // 驗證已更新
    expect(screen.getByTestId('search-text')).toHaveTextContent('aspirin');
    expect(screen.getByTestId('storage-locations')).toHaveTextContent('["A區","B區"]');

    // 重置
    fireEvent.click(screen.getByTestId('reset-btn'));

    // 驗證恢復預設值
    expect(screen.getByTestId('search-text')).toHaveTextContent('');
    expect(screen.getByTestId('storage-locations')).toHaveTextContent('[]');
    expect(screen.getByTestId('categories')).toHaveTextContent('[]');
    expect(screen.getByTestId('date-from')).toHaveTextContent('undefined');
    expect(screen.getByTestId('date-to')).toHaveTextContent('undefined');
    expect(screen.getByTestId('manifest-status')).toHaveTextContent('["active","archived"]');
    expect(screen.getByTestId('counted-status')).toHaveTextContent('undefined');
    expect(screen.getByTestId('has-discrepancy')).toHaveTextContent('null');
  });

  it('多個組件共享同一 Context 應同步狀態', () => {
    const ComponentA = () => {
      const { filters, updateFilters } = useQueryFilters();
      return (
        <div>
          <span data-testid="a-search-text">{filters.searchText}</span>
          <button onClick={() => updateFilters({ searchText: 'from-a' })} data-testid="a-update">A Update</button>
        </div>
      );
    };

    const ComponentB = () => {
      const { filters } = useQueryFilters();
      return <span data-testid="b-search-text">{filters.searchText}</span>;
    };

    render(
      <QueryFiltersProvider>
        <ComponentA />
        <ComponentB />
      </QueryFiltersProvider>
    );

    expect(screen.getByTestId('a-search-text')).toHaveTextContent('');
    expect(screen.getByTestId('b-search-text')).toHaveTextContent('');

    fireEvent.click(screen.getByTestId('a-update'));

    expect(screen.getByTestId('a-search-text')).toHaveTextContent('from-a');
    expect(screen.getByTestId('b-search-text')).toHaveTextContent('from-a');
  });

  it('不應在 Provider 外部使用 useQueryFilters', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow();

    consoleError.mockRestore();
  });
});