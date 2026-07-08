-- 新增 DELETE 政策：允許用戶刪除自己的 Google Drive 連線
CREATE POLICY "Users can delete own gdrive connection"
ON user_gdrive_connections
FOR DELETE
TO authenticated
USING (user_id = auth.uid());