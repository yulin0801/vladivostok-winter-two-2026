# GitHub Pages 发布说明

这个项目可以把网页界面发布到 GitHub Pages。共同编辑、图片上传、地点搜索和路线服务仍由现有 Vercel API 提供；GitHub Pages 本身不运行数据库或 Next.js API。当前应用允许任何访问者查看和编辑，分享地址时请按公开网站对待。

## 本地生成网页

使用 Node.js 22，在项目根目录运行：

```sh
npm ci
npm run build:pages
```

默认仓库名为 `vladivostok-winter-two-2026`，输出地址对应 `https://你的GitHub用户名.github.io/vladivostok-winter-two-2026/`。GitHub 用户名不写入构建，因此换账号但保持仓库名时不需要修改路径。

脚本的两个公开配置也可显式传入：

```sh
npm run build:pages -- --base-path /vladivostok-winter-two-2026 --api-origin https://vladivostok-winter-two-2026.vercel.app
```

也支持 `NEXT_PUBLIC_BASE_PATH` 与 `NEXT_PUBLIC_API_ORIGIN` 环境变量。参数优先于环境变量。API 必须是完整的 HTTPS origin，不要加尾部斜杠、路径或密钥。用户主页仓库（`用户名.github.io`）或独立域名使用 `--base-path /`。修改仓库名、路径或 API 地址后必须重新构建。

构建在 `work/pages-build/` 内进行，仅复制明确允许的前端源码、样式和公开资源，复用根目录已安装的 `node_modules`。它不会读取或复制 `.env`、`app/api/`、数据库代码、项目绑定或原有 `.next/`。构建完成后替换 `docs/`，包含 `.nojekyll`，不输出 source maps。保留生成的 `.pages-build.json`，脚本用它确认 `docs/` 是可重新生成的输出目录；若原本有其他用途的 `docs/`，请先移走并保留原文件。

## 在 GitHub 开启 Pages

1. 将经过清理的项目源码及生成的整个 `docs/` 上传到目标仓库的 `main` 分支。不要上传 `.env`、`.vercel`、`.openai`、`node_modules`、`.next`、`work` 或数据库凭证。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. Branch 选择 **main**，目录选择 **/docs**，点击 **Save**。
5. 等待 GitHub 完成部署，使用页面显示的正式地址访问。

Vercel 后端需要允许该 GitHub Pages 的 origin，例如 `https://你的GitHub用户名.github.io`，才能接收跨域读写请求；origin 不包括仓库路径。请在后端的 CORS 允许配置中登记该地址，并重新部署后端。`docs/` 已加入 `.vercelignore`，不会被上传到 Vercel 部署包。

发布后检查：主页、地图和头像能加载；新建一条测试记录后，另一个浏览器也能看到；删除测试记录。若 Pages 能打开但 API 请求仍受网络限制，共享数据或上传仍可能失败，切换静态网页托管不能保证解决 API 的网络可达性。

更新页面样式或代码后，重新运行 `npm run build:pages`，再上传更新后的源码与 `docs/`。网站中编辑的旅行记录保存在 API 数据库，不需要每次编辑后重新发布 Pages。

## 官方参考

- [Next.js 静态导出](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)
- [GitHub Pages 发布来源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages 建站与 .nojekyll](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
