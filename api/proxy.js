// api/proxy.js
// 这是一个 Vercel Serverless Function，用于根据 Host 头进行反向代理

const PROXY_MAP = {
  "launcher.mirror.hkmc.online": "https://launcher.mojang.com",
  // 如果 launcher.mirror.hkmc.online 需要根据路径区分代理到 launchermeta.mojang.com
  // 请参考下面的 "关于 launcher.mirror.hkmc.online" 部分
  "resources.mirror.hkmc.online": "https://resources.download.minecraft.net",
  "libraries.mirror.hkmc.online": "https://libraries.minecraft.net",
  "files.forge.mirror.hkmc.online": "https://files.minecraftforge.net",
  "dl.liteloader.mirror.hkmc.online": "https://dl.liteloader.com",
  "meta.fabric.mirror.hkmc.online": "https://meta.fabricmc.net",
  "maven.fabric.mirror.hkmc.online": "https://maven.fabricmc.net",
  "maven.neoforged.mirror.hkmc.online": "https://maven.neoforged.net",
  "maven.quilt.mirror.hkmc.online": "https://maven.quiltmc.org",
  "meta.quilt.mirror.hkmc.online": "https://meta.quiltmc.org",
  // 默认回源地址，如果 Host 头没有匹配到任何配置的域名
  "default": "https://chat-in.sorapi.dev"
};

module.exports = async (req, res) => {
  // 获取原始请求的完整 URL 和 Host 头
  const originalUrl = new URL(req.url, `https://${req.headers.host}`);
  const host = req.headers.host;

  // 根据 Host 头查找目标基 URL
  let targetBaseUrl = PROXY_MAP[host];

  // 特殊处理 launcher.mirror.hkmc.online 的情况 (如果需要路径区分)
  if (host === "launcher.mirror.hkmc.online") {
    if (originalUrl.pathname.startsWith('/meta/')) { // 示例：如果路径以 /meta/ 开头
      targetBaseUrl = "https://launchermeta.mojang.com";
    } else {
      targetBaseUrl = "https://launcher.mojang.com";
    }
  }

  // 如果没有匹配到特定规则，使用默认回源
  if (!targetBaseUrl) {
    targetBaseUrl = PROXY_MAP["default"];
  }

  if (!targetBaseUrl) {
    res.status(404).send("Proxy destination not found for this host or no default specified.");
    return;
  }

  // 构建新的目标 URL
  const destinationURL = new URL(targetBaseUrl);
  destinationURL.pathname = originalUrl.pathname;
  destinationURL.search = originalUrl.search;

  try {
    // 转发请求到目标服务器
    // Vercel 的 fetch 接口会自动处理 Host 头，使其与 destinationURL 匹配
    const proxyRes = await fetch(destinationURL.toString(), {
      method: req.method,
      headers: req.headers, // 保留原始请求的头部信息
      body: req.body, // 保留原始请求的 body (POST, PUT等)
      redirect: 'follow'
    });

    // 将目标服务器的响应头复制到 Vercel 函数的响应中
    for (const [key, value] of proxyRes.headers.entries()) {
      // 避免复制 Vercel 内部处理的头，例如 Content-Encoding (如果 Vercel 会自动解压再压缩)
      // 如果目标返回了 gzip 编码，Vercel 会自动处理
      if (key.toLowerCase() === 'content-encoding' && value.includes('gzip')) {
        // Vercel 可能会自动解压并重新编码，所以最好不要直接转发此头
        continue;
      }
      res.setHeader(key, value);
    }

    // 设置响应状态码和 body
    res.status(proxyRes.status);
    res.send(await proxyRes.buffer()); // 获取响应体并发送
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).send("Proxy error.");
  }
};
