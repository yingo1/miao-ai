# GitHub 自动写回后台部署说明

这个后台用于让 `admin.html` 里的图片批量上传功能直接写回 GitHub 仓库。

## 需要准备

1. 一个 Vercel 账号。
2. 一个 GitHub Token，权限需要能读写 `yingo1/miao-ai` 仓库内容。
3. 一个你自己记得住的后台密码。

## 后端文件

后端接口文件已经放在：

```text
api/upload-images.js
```

部署后接口地址一般是：

```text
https://你的-vercel-项目名.vercel.app/api/upload-images
```

## Vercel 环境变量

在 Vercel 项目设置里添加这些 Environment Variables：

```text
GITHUB_TOKEN=你的 GitHub Token
GITHUB_OWNER=yingo1
GITHUB_REPO=miao-ai
GITHUB_BRANCH=main
ADMIN_PASSWORD=你自己设置的后台密码
ALLOWED_ORIGIN=https://yingo1.github.io
MAX_FILE_SIZE_MB=8
```

## 使用方法

1. 部署 Vercel 后端。
2. 打开 `https://yingo1.github.io/miao-ai/admin.html`。
3. 在“自动写回 GitHub”区域填入后端接口地址。
4. 填入 `ADMIN_PASSWORD` 对应的后台密码。
5. 在页面里批量选择图片。
6. 点击“直接写回 GitHub”。

写回成功后，GitHub Pages 通常需要 1-3 分钟刷新。

## 安全说明

不要把 `GITHUB_TOKEN` 写进 `admin.html`。

`GITHUB_TOKEN` 只能放在 Vercel 的环境变量里。网页只需要填写后端接口地址和后台密码。
