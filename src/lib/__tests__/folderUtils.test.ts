import { describe, it, expect } from 'vitest';
import { parseManifestDate } from '../folderUtils';
import { Manifest } from '../../types';

describe('Manifest Folders & AI Classification Logic', () => {
  it('應優先從 delivery_date 正確解析 年/月/日 階層 (斜線格式)', () => {
    const manifest: Manifest = {
      id: 'm-1',
      name: '測試清單',
      delivery_date: '2026/10/26',
      total_items: 50,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('10月');
    expect(result.day).toBe('26日');
    expect(result.dateStr).toBe('2026-10-26');
  });

  it('應從 delivery_date 正確解析 年/月/日 階層 (連字號格式)', () => {
    const manifest: Manifest = {
      id: 'm-2',
      name: '測試清單 2',
      delivery_date: '2026-07-17',
      total_items: 20,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('7月');
    expect(result.day).toBe('17日');
    expect(result.dateStr).toBe('2026-07-17');
  });

  it('當無 delivery_date 時，應能從藥局特定單號 (如 R012610260004) 解析出日期', () => {
    const manifest: Manifest = {
      id: 'm-3',
      name: 'R012610260004',
      total_items: 87,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('10月');
    expect(result.day).toBe('26日');
  });

  it('當無 delivery_date 時，應能從藥局單號 R012607170002 解析出 07/17', () => {
    const manifest: Manifest = {
      id: 'm-4',
      name: 'R012607170002',
      total_items: 244,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('7月');
    expect(result.day).toBe('17日');
  });

  it('若無 delivery_date 且單號無日期特徵，應 fallback 至 created_at', () => {
    const manifest: Manifest = {
      id: 'm-5',
      name: '特別手動清單',
      created_at: '2026-05-12T10:00:00Z',
      total_items: 10,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('5月');
    expect(result.day).toBe('12日');
  });
});
