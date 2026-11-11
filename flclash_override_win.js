// FlClash (Windows) 覆写脚本
// 用法: FlClash -> 工具/覆写 -> 新建脚本 -> 粘贴本文件内容 -> 在配置中启用该覆写
// 入口必须是 main(config),返回修改后的 config
// 说明: 参考 isdzhou/clash 的 Android 版本改写,去掉了 Android 专用的部分
//  - 不再写入 tun(Windows 的 TUN 需管理员权限,请在 FlClash 界面里自行开关)
//  - 不再写入 mixed-port / allow-lan(端口与局域网开关交给 FlClash 设置页管理)
//  - 去掉 Google Play 相关的 DNS 策略与规则
//  - DNS 不再监听 0.0.0.0:1053,避免占用端口和暴露到局域网

const main = (config) => {
  const proxies = config.proxies || [];
  if (proxies.length === 0) return config;

  /* ---------- 基础设置 ---------- */
  config["mode"] = "rule";
  config["log-level"] = "warning";
  config["ipv6"] = false;
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["geodata-mode"] = true;
  config["geo-auto-update"] = true;
  config["geo-update-interval"] = 24;
  config["geox-url"] = {
    geoip: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    geosite: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    mmdb: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",
  };

  /* ---------- DNS ---------- */
  config["dns"] = {
    enable: true,
    ipv6: false,
    "respect-rules": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": [
      "*.lan",
      "*.local",
      "+.msftconnecttest.com", // Windows 联网检测
      "+.msftncsi.com", // Windows 联网检测
      "localhost.ptlogin2.qq.com",
      "time.*.com",
      "ntp.*.com",
      "time.windows.com", // Windows 时间同步
      "+.stun.*.*",
      "+.stun.*.*.*",
    ],
    // 仅用于解析下面 DoH 地址本身的域名(必须是纯 IP)
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    // 解析机场节点域名:只能直连解析
    "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    // 默认走海外 DoH。respect-rules 下这些查询会按规则走代理,不会把境外域名暴露给本地运营商
    nameserver: ["https://1.1.1.1/dns-query", "https://dns.google/dns-query"],
    // 只有国内域名 / 内网域名才用国内 DNS
    "nameserver-policy": {
      "geosite:private,cn": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    },
    // 出站为 DIRECT 的域名用国内 DNS 解析
    "direct-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    "direct-nameserver-follow-policy": false,
    // 不再使用 fallback / fallback-filter,避免国内外 DNS 并发查询造成泄露
  };

  /* ---------- TUN 防 DNS 泄露 ---------- */
  // 不写 enable,开关仍由 FlClash 界面控制;这里只补充防泄露相关参数
  config["tun"] = {
    ...(config["tun"] || {}),
    "auto-route": true,
    "strict-route": true, // 严格路由:阻止流量绕过虚拟网卡(含 Windows 多网卡并发 DNS)
    "dns-hijack": ["any:53", "tcp://any:53"], // 劫持所有 53 端口 DNS 请求
  };

  /* ---------- 流量嗅探 ---------- */
  config["sniffer"] = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": false,
    sniff: {
      HTTP: { ports: [80, "8080-8880"] },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] },
    },
    "skip-domain": ["Mijia Cloud", "+.push.apple.com"],
  };

  /* ---------- 代理组 ---------- */
  // 过滤订阅里常见的“流量/到期/官网”等信息节点,避免混进自动选择
  const infoRe = /剩余|流量|到期|过期|套餐|官网|重置|订阅|距离|expire|traffic/i;
  const allNames = proxies.map((p) => p.name).filter((n) => !infoRe.test(n));
  const pick = (re) => allNames.filter((n) => re.test(n));

  const regions = [
    { name: "🇭🇰 香港", re: /港|HK|Hong ?Kong|🇭🇰/i },
    { name: "🇯🇵 日本", re: /日本|JP|Japan|🇯🇵/i },
    { name: "🇸🇬 新加坡", re: /新加坡|狮城|SG|Singapore|🇸🇬/i },
    { name: "🇺🇸 美国", re: /美国|美|US|United ?States|🇺🇸/i },
    { name: "🇹🇼 台湾", re: /台|TW|Taiwan|🇹🇼/i },
  ];

  const regionGroups = regions
    .map((r) => ({ ...r, list: pick(r.re) }))
    .filter((r) => r.list.length > 0)
    .map((r) => ({
      name: r.name,
      type: "url-test",
      proxies: r.list,
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
    }));

  const regionNames = regionGroups.map((g) => g.name);
  const common = ["♻️ 自动选择", ...regionNames, "🚀 手动切换", "DIRECT"];
  const proxyFirst = ["🚀 节点选择", ...regionNames, "🚀 手动切换"];

  config["proxy-groups"] = [
    { name: "🚀 节点选择", type: "select", proxies: common },
    { name: "🚀 手动切换", type: "select", proxies: allNames },
    {
      name: "♻️ 自动选择",
      type: "url-test",
      proxies: allNames,
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
    },
    { name: "🤖 AI 服务", type: "select", proxies: proxyFirst },
    { name: "📲 Telegram", type: "select", proxies: proxyFirst },
    { name: "🎬 国际媒体", type: "select", proxies: proxyFirst },
    { name: "🍎 苹果服务", type: "select", proxies: ["DIRECT", "🚀 节点选择"] },
    { name: "Ⓜ️ 微软服务", type: "select", proxies: ["DIRECT", "🚀 节点选择"] },
    { name: "🎯 全球直连", type: "select", proxies: ["DIRECT", "🚀 节点选择"] },
    { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"] },
    { name: "🐟 漏网之鱼", type: "select", proxies: ["🚀 节点选择", "DIRECT"] },
    ...regionGroups,
  ];

  /* ---------- 规则集 ---------- */
  const base = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const rp = (name, behavior, path) => ({
    type: "http",
    behavior,
    format: "mrs",
    url: `${base}/${path}/${name}.mrs`,
    path: `./ruleset/${path}_${name}.mrs`,
    interval: 86400,
  });

  config["rule-providers"] = {
    ads: rp("category-ads-all", "domain", "geosite"),
    openai: rp("openai", "domain", "geosite"),
    anthropic: rp("anthropic", "domain", "geosite"),
    "google-gemini": rp("google-gemini", "domain", "geosite"),
    telegram_domain: rp("telegram", "domain", "geosite"),
    telegram_ip: rp("telegram", "ipcidr", "geoip"),
    netflix: rp("netflix", "domain", "geosite"),
    youtube: rp("youtube", "domain", "geosite"),
    apple: rp("apple-cn", "domain", "geosite"),
    microsoft: rp("microsoft@cn", "domain", "geosite"),
    private: rp("private", "domain", "geosite"),
    private_ip: rp("private", "ipcidr", "geoip"),
    cn_domain: rp("cn", "domain", "geosite"),
    cn_ip: rp("cn", "ipcidr", "geoip"),
    geolocation_not_cn: rp("geolocation-!cn", "domain", "geosite"),
  };

  config["rules"] = [
    // Windows 可按进程名分流,按需取消注释(进程名需与任务管理器一致)
    // "PROCESS-NAME,steam.exe,🎯 全球直连",
    // "PROCESS-NAME,WeChat.exe,🎯 全球直连",

    "RULE-SET,ads,🛑 广告拦截",
    "RULE-SET,private,🎯 全球直连",
    "RULE-SET,private_ip,🎯 全球直连,no-resolve",

    "RULE-SET,openai,🤖 AI 服务",
    "RULE-SET,anthropic,🤖 AI 服务",
    "RULE-SET,google-gemini,🤖 AI 服务",
    "RULE-SET,telegram_domain,📲 Telegram",
    "RULE-SET,telegram_ip,📲 Telegram,no-resolve",
    "RULE-SET,netflix,🎬 国际媒体",
    "RULE-SET,youtube,🎬 国际媒体",
    "RULE-SET,apple,🍎 苹果服务",
    "RULE-SET,microsoft,Ⓜ️ 微软服务",
    "RULE-SET,geolocation_not_cn,🚀 节点选择",
    "RULE-SET,cn_domain,🎯 全球直连",
    "RULE-SET,cn_ip,🎯 全球直连,no-resolve",
    "MATCH,🐟 漏网之鱼",
  ];

  return config;
};
