import Link from 'next/link';
import { PackageSearch, FileUp, ClipboardCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 flex items-center justify-center gap-3">
            <PackageSearch className="w-10 h-10 text-blue-600" />
            PhamaCount Web
          </h1>
          <p className="text-lg text-gray-600">
            藥局智能藥品清點與數位化管理系統
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link 
            href="/import" 
            className="p-6 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <FileUp className="w-6 h-6" />
              </div>
              <div className="text-xl font-semibold">匯入清單</div>
              <p className="text-sm text-gray-500 text-center">
                上傳藥品清單，自動生成分頁數位核對表
              </p>
            </div>
          </Link>

          <Link 
            href="/manifests" 
            className="p-6 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-green-100 text-green-600 rounded-full group-hover:bg-green-600 group-hover:text-white transition-colors">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div className="text-xl font-semibold">開始清點</div>
              <p className="text-sm text-gray-500 text-center">
                選擇清單並依照分頁進行條碼核對
              </p>
            </div>
          </Link>
        </div>

        <div className="text-sm text-gray-400">
          © 2026 PhamaCount Web - 提升藥局物流效率
        </div>
      </div>
    </main>
  );
}
