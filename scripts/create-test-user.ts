import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 載入環境變數
config({ path: '.env.local' });

// 使用 Service Role Key 創建管理員客戶端
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const TEST_USER = {
  email: 'test-user@pharmacy.local',
  password: 'TestPassword123!',
  name: '測試使用者'
};

async function createTestUser() {
  console.log('🔧 開始創建測試用戶...');
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...');
  
  try {
    // 檢查用戶是否已存在
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ 列出用戶失敗:', listError);
      return;
    }
    
    const existingUser = users.find(u => u.email === TEST_USER.email);
    
    if (existingUser) {
      console.log('✅ 測試用戶已存在:', existingUser.id);
      
      // 更新密碼
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { password: TEST_USER.password, email_confirm: true }
      );
      
      if (updateError) {
        console.error('❌ 更新用戶密碼失敗:', updateError);
      } else {
        console.log('✅ 用戶密碼已更新');
      }
      
      return existingUser.id;
    }
    
    // 創建新用戶
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true,
      user_metadata: {
        name: TEST_USER.name,
        role: 'test_user'
      }
    });
    
    if (error) {
      console.error('❌ 創建用戶失敗:', error);
      return;
    }
    
    console.log('✅ 測試用戶創建成功:', data.user.id);
    return data.user.id;
    
  } catch (error) {
    console.error('❌ 創建測試用戶過程發生錯誤:', error);
  }
}

// 運行腳本
createTestUser().then(() => {
  console.log('🏁 腳本執行完成');
  process.exit(0);
}).catch((error) => {
  console.error('💥 腳本執行失敗:', error);
  process.exit(1);
});