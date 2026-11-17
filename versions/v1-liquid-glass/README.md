# v1 · Liquid Glass（2026-11-17 存档）

改成"留白 + 玻璃"新版之前的完整外观：全黑背景，每张照片全屏。

## 恢复方法

把这个文件夹里的文件复制回原位置，覆盖现有文件：

```bash
cp -R versions/v1-liquid-glass/public/ public/
```

```bash
cp versions/v1-liquid-glass/admin/* admin/
```

然后刷新浏览器（⌘⇧R）。你的照片和内容不会受影响。
`content.json` 是存档当时的内容备份，一般不需要恢复。

新版（v2）在做完当天也存了一份，在 `versions/v2-paper-glass/`，用同样的方法可以换回去。
如果之后新版又改过，换回 v1 之前请先重新存一份新版（或者让 Claude 来做）。

---

Snapshot of the site code before the v2 "paper + glass" redesign. Restore by copying `public/` and `admin/`
back over the live ones; content and uploads are shared and untouched.
