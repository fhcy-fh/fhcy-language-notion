# FHCY LANGUAGE

1. Fork github 项目

2. 配置notion开发者

   > 打开 [notion开发者平台](https://app.notion.com/developers/connections)
   >
   > 连接 > 新建连接 > 访问令牌
   >
   > ![004](https://github.com/user-attachments/assets/9ac9ba89-32d7-49e7-961b-0c0feee71b26)
   >
   > 仅开启只读权限, 关闭其他权限
   >
   > ![005](https://github.com/user-attachments/assets/b7b39621-8ca0-46c3-b41a-7e7e555af6ad)
   >
   > 保存令牌

3. Notion网站配置

   > copy notion [网站配置](https://www.notion.so/fhcy/38e962f50f088043aa2ae88cb47ea17b?v=38e962f50f0880c9ac76000c0e237073&source=copy_link) 到自己的notion笔记中
   >
   > 修改笔记图标/标题
   >
   > 点击右上角 共享 > 发布
   >
   > ![001](https://github.com/user-attachments/assets/99103f43-a6ea-4b9c-b46d-3124cac6f405)
   > 
   > 集成到新建的连接
   > 
   > ![011](https://github.com/user-attachments/assets/d8620ecc-2f15-4ffd-8971-88af5bdd6be2)
   >
   > 保存数据源ID
   >
   > ![002](https://github.com/user-attachments/assets/6889b60b-8448-4854-abb8-3103b9a0b993)
   >
   > ![003](https://github.com/user-attachments/assets/863ee619-3ea5-42c0-af61-85f028e45096)



4. Notion单词书模板

   > copy [单词书模板](https://www.notion.so/fhcy/38e962f50f08805fa1e8c8ce530ecf8e?v=38e962f50f088094ba43000cff6b0736&source=copy_link)
   >
   > 发布单词书
   > 
   > 集成到新建的连接, 每一个新建的单词书都需要集成到连接
   >
   > 复制数据源ID到上方配置的Notion网站配置的表格中的data_source_id列中, name是单词书名称

5. Vercel部署

   > [Vercel平台](https://vercel.com/)
   >
   > 创建项目
   >
   > ![006](https://github.com/user-attachments/assets/43e23b2a-c4a2-4c5f-8518-b94b2ffe8353)
   >
   > 从github导入
   >
   > ![007](https://github.com/user-attachments/assets/5d74ef19-422a-4657-baa3-04ac54d0c3e6)
   >
   > 填写环境变量
   >
   > NOTION_TOKEN : 上方保存的notion令牌
   >
   > NOTION_DATA_SOURCE_ID : notion网站配置的数据源ID
   >
   > ![008](https://github.com/user-attachments/assets/08fe570f-4429-418a-9e70-1cb75a6f057b)
   >
   > Deploy
   >
   > 检测状态Ready
   >
   > ![009](https://github.com/user-attachments/assets/9d3e71cd-476c-4b7f-a1d2-35103f1f3909)
   >
   > 访问Vercel免费域名

6. 腾讯云EdgeOne部署

   > [腾讯云EdgeOne](https://console.cloud.tencent.com/edgeone/makers)
   >
   > 同上
   >
   > 腾讯云部署需要自备域名

7. 开始添加单词

   > ![010](https://github.com/user-attachments/assets/02d6aeca-70cb-47dc-9b8f-2c60520bf667)

