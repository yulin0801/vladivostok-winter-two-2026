# 去海的另一边 · 海参崴旅行手册

崔天琴（小脆）与张渝琳（小鱼），2026 年 12 月 5–9 日的共同旅行网站。

主页地图、每日行程与道路路线优化、共同备忘、双人行李、美食、酒店比较、伴手礼。按用户最新选择，普通链接公开可查看和编辑，无需注册、登录或编辑密钥。姓名只是修改记录的自选标签，并非经过验证的身份。

## 运行与发布

迁移版本使用 Next.js、Vercel、Turso/libSQL 数据库和 Vercel Blob 图片存储。原 Sites 项目保留在独立目录，不受此迁移影响。

1. 安装依赖：npm ci。
2. 使用 Vercel CLI 登录并关联正确的项目。
3. 连接免费 Turso Starter 数据库和公开 Blob 存储，再运行 vercel env pull .env.local --yes。所需变量名称见 .env.example，不要提交真实值。
4. 使用公共协作模式，无需配置访问密钥。
5. 初始化数据库：node --env-file=.env.local scripts/migrate-turso.mjs。该脚本只创建缺失表，不覆盖已有记录。
6. npm run test:database、npm run build；开发使用 npm run dev，生产运行 npm start。
7. 从已确认关联的目录运行 vercel deploy --prod。

数据库按版本进行并发检查，批量行程重排为原子更新。客户端定期同步，发生冲突时保留已写入的新版本。环境图片公开可读，同源访客均可上传，支持 JPG/PNG/WebP/GIF，每张最多 4 MB。

地图为 OpenStreetMap；位置搜索使用 Photon；步行路线使用 FOSSGIS 路网服务，驾车路线使用 OSRM。距离和时长为模型估计，并非实时交通。地图保留署名与必要 Referer；不进行离线批量下载。外部地图服务可能因网络或服务限额暂时不可用。

机票时间按用户提供的票面时间记录；每日行程按海参崴当地时间。景点初始行程为可编辑草案，餐厅和酒店不包含虚构价格或预订结果。
