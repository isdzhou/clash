// FlClash (Android) 覆写脚本
// 用法:FlClash -> 工具 -> 覆写 -> 新建脚本 -> 粘贴本文件内容 -> 在配置中启用该覆写
// 脚本入口必须是 main(config),返回修改后的 config

const main = (config) => {
  const proxies = config.proxies || [];
  if (proxies.length === 0) return config;

  /* ---------- 基础设置 ---------- */
  config["mixed-port"] = 7890;
  config["allow-lan"] = false;
  config["mode"] = "rule";
  config["log-level"] = "warning";
  config["ipv6"] = false;
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["find-process-mode"] = "off";
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
    listen: "0.0.0.0:1053",
    ipv6: false,
    "respect-rules": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": [
      "*.lan",
      "*.local",
      "+.msftconnecttest.com",
      "+.msftncsi.com",
      "localhost.ptlogin2.qq.com",
      "time.*.com",
      "ntp.*.com",
    ],
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    nameserver: ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    fallback: ["https://1.1.1.1/dns-query", "https://dns.google/dns-query"],
    "fallback-filter": { geoip: true, "geoip-code": "CN", ipcidr: ["240.0.0.0/4"] },
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

  /* ---------- TUN(Android 使用 VpnService,FlClash 内置开关即可) ---------- */
  config["tun"] = {
    enable: true,
    stack: "mixed",
    "auto-route": true,
    "dns-hijack": ["any:53"],
  };

  /* ---------- 代理组 ---------- */
  const allNames = proxies.map((p) => p.name);
  const pick = (re) => allNames.filter((n) => re.test(n));

  const regions = [
    { name: "🇭🇰 香港", re: /港|HK|Hong ?Kong|🇭🇰/i },
    { name: "🇯🇵 日本", re: /日本|JP|Japan|🇯🇵/i },
    { name: "🇸🇬 新加坡", re: /新加坡|狮城|SG|Singapore|🇸🇬/i },
    { name: "🇺🇸 美国", re: /美|US|United ?States|🇺🇸/i },
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
    { name: "🤖 AI 服务", type: "select", proxies: ["🚀 节点选择", ...regionNames, "🚀 手动切换"] },
    { name: "📲 Telegram", type: "select", proxies: ["🚀 节点选择", ...regionNames, "🚀 手动切换"] },
    { name: "🎬 国际媒体", type: "select", proxies: ["🚀 节点选择", ...regionNames, "🚀 手动切换"] },
    { name: "🍎 苹果服务", type: "select", proxies: ["DIRECT", "🚀 节点选择"] },
    { name: "Ⓜ️ 微软服务", type: "select", proxies: ["DIRECT", "🚀 节点选择"] },
    { name: "🎯 全球直连", type: "select", proxies: ["DIRECT", "🚀 节点选择"] },
    { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"] },
    { name: "🐟 漏网之鱼", type: "select", proxies: ["🚀 节点选择", "DIRECT"] },
    ...regionGroups,
  ];

  /* ---------- 规则集 ---------- */
  const base = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const rp = (name, type, path) => ({
    type: "http",
    behavior: type,
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