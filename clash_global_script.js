/***
 * Clash Party / Clash Verge Rev 覆写脚本(加固精简版)
 * 基于 dahaha-365 (YaNet): https://github.com/dahaha-365/YaNet
 *
 * 本版本不再处理 DNS、TUN、域名嗅探,请在软件界面里单独设置。
 *
 * 相对原版的修改:
 *  1. 删除 dns / tun / sniffer 三部分配置(交给软件管理)
 *  2. 控制接口默认关闭;开启时必须自行设置 secret,CORS 不再是 '*'
 *  3. 默认不对局域网开放(allow-lan=false, bind 127.0.0.1)
 *  4. 不再设置 port / socks-port / redir-port / tproxy-port;混合端口默认沿用软件设置
 *  5. 默认不下载 zashboard 面板(需要时才开启)
 *  6. 远程控制端口直连规则改为开关(默认开启,与原版行为一致),并去掉重复项
 *  7. 修复 enable 永远为 true 的问题;修复无 proxies 字段时 push 报错
 *  8. 给 GEOIP,telegram 补上 no-resolve,避免规则模式下本地解析域名(DNS 泄露来源)
 *  9. 新增可开关的 STUN/WebRTC UDP 分流规则(proxyStunUdp),只让 STUN 流量走代理
 * 10. 精简策略组:删除 Pixiv / HBO / Hulu / Prime Video / Disney+ / Tiktok / NETFLIX /
 *     Line / WhatsApp / 日本网站 / 巴哈姆特 / 哔哩哔哩东南亚 / 港澳台媒体 / 游戏专用,
 *     只保留常用的 AI、YouTube、Spotify、Telegram、Github、谷歌、微软、苹果、广告过滤
 */

// ===================== 用户自定义区 =====================

// 控制接口(外部面板 / API)。不需要就保持 false。
const enableController = false
// 仅当 enableController = true 时生效,请改成你自己的随机长字符串(至少 16 位)
const controllerSecret = ''
// 允许访问控制接口的面板来源
const controllerAllowOrigins = ['http://127.0.0.1:9090']
// 是否下载并启用 zashboard 面板(需要 enableController = true)
const enableZashboard = false

// 是否允许局域网设备使用本机代理。开启后强烈建议自行添加 authentication
const allowLan = false

// 混合端口(HTTP + SOCKS5)。留 null 则沿用软件里的设置;填数字则强制覆盖
const mixedPort = null

// 远程控制 / 内网穿透相关端口是否直连(SSH、RDP、TeamViewer、AnyDesk 等)
// 开启会暴露真实 IP,但能避免这类连接被代理破坏
const directRemotePorts = true

// WebRTC / STUN 的 UDP 流量强制走代理(用于防止 WebRTC 暴露真实公网 IP)
// 注意:必须让浏览器的 UDP 流量进入 Clash(例如开启 TUN)才会生效;
// 并且你的节点需要支持 UDP。仅匹配 STUN 域名关键字和常见 STUN 端口,不影响游戏、局域网等其他 UDP
const proxyStunUdp = true

// ===================== 工具函数 =====================

function stringToArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val !== 'string') return []
  return val
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

// --- 1. 静态配置区域 ---

const defaultArgs = {
  enable: true,
  ruleSet: 'all',
  regionSet: 'all',
  interfaceName: '',
  excludeHighPercentage: true,
  globalRatioLimit: 2,
  githubProxy: '',
}

let rawArgs = typeof $arguments !== 'undefined' ? $arguments : {}

const args = {
  ...defaultArgs,
  ...Object.fromEntries(
    Object.entries(rawArgs)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        // 仅处理字符串类型
        if (typeof value === 'string') {
          const trimmed = value.trim()

          // 转换布尔字符串
          if (trimmed === 'true') return [key, true]
          if (trimmed === 'false') return [key, false]

          // 转换数字字符串(仅当字符串与数字的 toString() 完全一致时)
          if (trimmed !== '' && !isNaN(trimmed) && String(Number(trimmed)) === trimmed) {
            return [key, Number(trimmed)]
          }
        }
        return [key, value] // 保持原值
      })
  ),
}

let {
  enable,
  ruleSet, // 支持 'all' 或 'openai;youtube;ads' 这种格式(分号分隔)
  regionSet, // 匹配 regionDefinitions.name 前两个字母 (严格大小写),分号分隔
  interfaceName,
  excludeHighPercentage,
  globalRatioLimit,
  githubProxy,
} = args

excludeHighPercentage = !!excludeHighPercentage

/**
 * 分流规则配置,会自动生成对应的策略组
 * true = 启用
 * false = 禁用
 */
let ruleOptions = {
  apple: false,
  microsoft: false,
  github: false,
  google: false,
  openai: false,
  youtube: false,
  spotify: false,
  telegram: false,
  ads: false,
}

if (ruleSet === 'all') {
  Object.keys(ruleOptions).forEach((key) => (ruleOptions[key] = true))
} else if (typeof ruleSet === 'string') {
  const enabledKeys = ruleSet.split(';').map((s) => s.trim())
  enabledKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(ruleOptions, key)) {
      ruleOptions[key] = true
    }
  })
}

// 初始规则
const rules = []

if (directRemotePorts) {
  rules.push(
    'DST-PORT,22,直连', // Git SSH(必须放首位,防止密钥协商失败)
    'DST-PORT,3389,直连', // Windows远程连接
    'DST-PORT,5938,直连', // TeamViewer
    'DST-PORT,7070,直连', // AnyDesk
    'DST-PORT,19966,直连', // 向日葵远程控制
    'DST-PORT,21114-21119,直连', // RustDesk
    'DST-PORT,4118,直连', // 蒲公英P2P穿透
    'DST-PORT,7654,直连', // N2N SuperNode
    'DST-PORT,9118,直连', // 节点小宝
    'DST-PORT,50000-50100,直连', // AnyDesk/RustDesk 备用中继端口
    'DST-PORT,5353,直连' // 向日葵内网穿透
  )
}

if (proxyStunUdp) {
  rules.push(
    'AND,((NETWORK,UDP),(DOMAIN-KEYWORD,stun)),默认节点', // stun.l.google.com、stun.cloudflare.com 等
    'AND,((NETWORK,UDP),(DST-PORT,3478)),默认节点', // STUN/TURN 标准端口
    'AND,((NETWORK,UDP),(DST-PORT,5349)),默认节点', // STUN/TURN over DTLS
    'AND,((NETWORK,UDP),(DST-PORT,19302-19309)),默认节点' // Google STUN 常用端口
  )
}

rules.push(
  'GEOSITE,category-collaborate-cn,直连',
  'GEOSITE,category-container,默认节点',
  'RULE-SET,applications,下载软件,no-resolve'
)

// 地区定义 (Icons 使用 GitHub Raw)
const allRegionDefinitions = [
  {
    name: 'HK香港',
    regex: /港|🇭🇰|hk|hongkong|hong kong/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hong_Kong.png',
  },
  {
    name: 'US美国',
    regex: /(?!.*aus)(?=.*(美|🇺🇸|us(?!t)|usa|american|united states)).*/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_States.png',
  },
  {
    name: 'JP日本',
    regex: /日本|🇯🇵|jp|japan/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Japan.png',
  },
  {
    name: 'KR韩国',
    regex: /韩|🇰🇷|kr|korea/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Korea.png',
  },
  {
    name: 'SG新加坡',
    regex: /新加坡|🇸🇬|sg|singapore/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Singapore.png',
  },
  {
    name: 'CN中国大陆',
    regex: /中国|🇨🇳|cn|china/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China_Map.png',
  },
  {
    name: 'TW台湾',
    regex: /台湾|台灣|🇹🇼|tw|taiwan|tai wan/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China.png',
  },
  {
    name: 'GB英国',
    regex: /英|🇬🇧|uk|united kingdom|great britain/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_Kingdom.png',
  },
  {
    name: 'DE德国',
    regex: /德国|🇩🇪|de|germany/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Germany.png',
  },
  {
    name: 'MY马来西亚',
    regex: /马来|🇲🇾|my|malaysia/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Malaysia.png',
  },
  {
    name: 'TK土耳其',
    regex: /土耳其|🇹🇷|tk|turkey/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Turkey.png',
  },
  {
    name: 'CA加拿大',
    regex: /加拿大|🇨🇦|ca|canada/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Canada.png',
  },
  {
    name: 'AU澳大利亚',
    regex: /澳大利亚|🇦🇺|au|australia|sydney/i,
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Australia.png',
  },
]

let regionDefinitions = []
if (regionSet === 'all') {
  regionDefinitions = allRegionDefinitions
} else {
  const enabledRegions = stringToArray(regionSet)
  regionDefinitions = allRegionDefinitions.filter((r) => {
    const prefix = r.name.substring(0, 2) // 获取前两个字母
    return enabledRegions.includes(prefix)
  })
}

// 通用配置
const ruleProviderCommon = {
  type: 'http',
  format: 'yaml',
  interval: 86400,
}
const groupBaseOption = {
  interval: 300,
  timeout: 3000,
  url: 'https://www.gstatic.com/generate_204',
  lazy: true,
  'max-failed-times': 3,
  hidden: false,
}

// 预定义 Rule Providers
const ruleProviders = {
  applications: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: 'https://github.com/DustinWin/ruleset_geodata/raw/refs/heads/mihomo-ruleset/applications.list',
    path: './ruleset/DustinWin/applications.list',
  },
}

// 倍率正则预编译
const multiplierRegex = /(?<=[xX✕✖⨉倍率])([1-9]+(\.\d+)*|0{1}\.\d+)(?=[xX✕✖⨉倍率])*/i

// --- 2. 服务规则数据结构 ---
const serviceConfigs = [
  {
    key: 'openai',
    name: '国外AI',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/ChatGPT.png',
    url: 'https://chat.openai.com/cdn-cgi/trace',
    rules: [
      'GEOSITE,jetbrains-ai,国外AI',
      'GEOSITE,category-ai-!cn,国外AI',
      'GEOSITE,category-ai-chat-!cn,国外AI',
      'DOMAIN-SUFFIX,meta.ai,国外AI',
      'DOMAIN-SUFFIX,meta.com,国外AI',
    ],
  },
  {
    key: 'youtube',
    name: 'YouTube',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/YouTube.png',
    url: 'https://www.youtube.com/s/desktop/494dd881/img/favicon.ico',
    rules: ['GEOSITE,youtube,YouTube'],
  },
  {
    key: 'spotify',
    name: 'Spotify',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Spotify.png',
    url: 'https://spclient.wg.spotify.com/signup/public/v1/account',
    rules: ['GEOSITE,spotify,Spotify'],
  },
  {
    key: 'telegram',
    name: 'Telegram',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Telegram.png',
    url: 'https://www.telegram.org/img/website_icon.svg',
    rules: ['GEOIP,telegram,Telegram,no-resolve'],
  },
  {
    key: 'ads',
    name: '广告过滤',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Advertising.png',
    rules: ['GEOSITE,category-ads-all,广告过滤', 'RULE-SET,adblockmihomo,广告过滤'],
    providers: [
      {
        key: 'adblockmihomo',
        url: 'https://github.com/217heidai/adblockfilters/raw/refs/heads/main/rules/adblockmihomo.mrs',
        path: './ruleset/adblockfilters/adblockmihomo.mrs',
        format: 'mrs',
        behavior: 'domain',
      },
    ],
    reject: true,
  },
  {
    key: 'apple',
    name: '苹果服务',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Apple_2.png',
    url: 'https://www.apple.com/library/test/success.html',
    rules: ['GEOSITE,apple-cn,苹果服务'],
  },
  {
    key: 'google',
    name: '谷歌服务',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png',
    url: 'https://www.google.com/generate_204',
    rules: ['GEOSITE,google,谷歌服务'],
  },
  {
    key: 'github',
    name: 'Github',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/GitHub.png',
    url: 'https://github.com/robots.txt',
    rules: ['GEOSITE,github,Github'],
  },
  {
    key: 'microsoft',
    name: '微软服务',
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Microsoft.png',
    url: 'https://www.msftconnecttest.com/connecttest.txt',
    rules: ['GEOSITE,microsoft@cn,国内网站', 'GEOSITE,microsoft,微软服务'],
  },
]

// --- 3. 主入口 ---

function main(config) {
  if (!enable) return config

  const proxies = config?.proxies || []
  const proxyCount = proxies.length
  const proxyProviderCount =
    typeof config?.['proxy-providers'] === 'object' ? Object.keys(config['proxy-providers']).length : 0

  if (proxyCount === 0 && proxyProviderCount === 0) {
    throw new Error('配置文件中未找到任何代理')
  }

  // 控制接口开启时必须设置自己的 secret
  if (enableController && (!controllerSecret || controllerSecret.length < 16)) {
    throw new Error('已开启控制接口:请先在脚本顶部把 controllerSecret 设置为至少 16 位的随机字符串')
  }

  // 3.1 覆盖基础配置(DNS / TUN / 域名嗅探 不在此处理,请在软件界面设置)
  config['allow-lan'] = !!allowLan
  config['bind-address'] = allowLan ? '*' : '127.0.0.1'
  config['mode'] = 'rule'
  if (typeof mixedPort === 'number') {
    config['mixed-port'] = mixedPort
  }

  if (enableController) {
    config['external-controller'] = '127.0.0.1:9090'
    config['external-controller-cors'] = {
      'allow-origins': controllerAllowOrigins,
      'allow-private-network': false,
    }
    config['secret'] = controllerSecret
    if (enableZashboard) {
      config['external-ui'] = 'ui'
      config['external-ui-url'] = `${githubProxy}https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip`
    }
  }

  config['profile'] = {
    'store-selected': true,
    'store-fake-ip': true,
  }
  config['unified-delay'] = true
  config['tcp-concurrent'] = true
  config['keep-alive-interval'] = 1800
  config['find-process-mode'] = 'strict'
  config['geodata-mode'] = false
  config['geodata-loader'] = 'memconservative'
  config['geo-auto-update'] = true
  config['geo-update-interval'] = 24

  if (interfaceName && interfaceName.length > 0) {
    config['interface-name'] = interfaceName
  }

  config['ntp'] = {
    enable: true,
    'write-to-system': false,
    server: 'cn.ntp.org.cn',
  }
  config['geox-url'] = {
    geoip: `${githubProxy}https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat`,
    geosite: `${githubProxy}https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat`,
    mmdb: `${githubProxy}https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb`,
    asn: `${githubProxy}https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb`,
  }

  // 仅 proxy-providers 的订阅没有 proxies 字段,这里补上,避免 push 报错
  if (!Array.isArray(config.proxies)) config.proxies = []

  config.proxies.push({
    name: '直连',
    type: 'direct',
    udp: true,
    'routing-mark': 5555,
  })

  config.proxies.push({
    name: '拒绝',
    type: 'reject',
    udp: false,
  })

  // 3.2 高效代理分类 (单次遍历)
  const regionGroups = {}
  regionDefinitions.forEach(
    (r) =>
      (regionGroups[r.name] = {
        ...r,
        proxies: [],
      })
  )
  const otherProxies = []

  for (let i = 0; i < proxyCount; i++) {
    const proxy = proxies[i]
    const name = proxy.name
    let matched = false

    // 检查倍率
    if (excludeHighPercentage) {
      const match = multiplierRegex.exec(name)
      if (match && parseFloat(match[1]) > globalRatioLimit) {
        continue
      }
    }

    // 尝试匹配地区
    for (const region of regionDefinitions) {
      if (region.regex.test(name)) {
        regionGroups[region.name].proxies.push(name)
        matched = true
        break
      }
    }

    if (!matched) {
      otherProxies.push(name)
    }
  }

  const generatedRegionGroups = []
  regionDefinitions.forEach((r) => {
    const groupData = regionGroups[r.name]
    if (groupData.proxies.length > 0) {
      generatedRegionGroups.push({
        ...groupBaseOption,
        name: r.name,
        type: 'url-test',
        tolerance: 50,
        icon: r.icon,
        proxies: groupData.proxies,
      })
    }
  })

  const regionGroupNames = generatedRegionGroups.map((g) => g.name).sort()

  if (otherProxies.length > 0) {
    generatedRegionGroups.push({
      ...groupBaseOption,
      name: '其他节点',
      type: 'select',
      proxies: otherProxies,
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/World_Map.png',
    })
  }

  // 3.3 构建功能策略组
  const functionalGroups = []

  functionalGroups.push({
    ...groupBaseOption,
    name: '默认节点',
    type: 'select',
    proxies: [...regionGroupNames, '其他节点', '直连'].filter((n) => n !== '其他节点' || otherProxies.length > 0),
    icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png',
  })

  serviceConfigs.forEach((svc) => {
    if (ruleOptions[svc.key]) {
      rules.push(...svc.rules)

      if (Array.isArray(svc.providers)) {
        svc.providers.forEach((p) => {
          ruleProviders[p.key] = {
            ...ruleProviderCommon,
            behavior: p.behavior,
            format: p.format,
            url: p.url,
            path: p.path,
          }
        })
      }

      const groupProxies = svc.reject
        ? ['拒绝', '直连', '默认节点']
        : ['默认节点', ...regionGroupNames, '直连']

      functionalGroups.push({
        ...groupBaseOption,
        name: svc.name,
        type: 'select',
        proxies: groupProxies,
        url: svc.url,
        icon: svc.icon,
      })
    }
  })

  // 3.4 添加通用兜底策略组
  rules.push(
    'GEOSITE,private,直连',
    'GEOSITE,category-public-tracker,直连',
    'GEOSITE,category-game-platforms-download@cn,直连',
    'GEOSITE,category-remote-control,直连',
    'GEOIP,private,直连,no-resolve',
    'GEOSITE,cn,直连',
    'GEOIP,cn,直连,no-resolve',
    'MATCH,其他外网'
  )

  functionalGroups.push(
    {
      ...groupBaseOption,
      name: '下载软件',
      type: 'select',
      proxies: ['直连', '拒绝', '默认节点', '国内网站', ...regionGroupNames],
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Download.png',
    },
    {
      ...groupBaseOption,
      name: '其他外网',
      type: 'select',
      proxies: ['默认节点', '国内网站', ...regionGroupNames],
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Streaming!CN.png',
    },
    {
      ...groupBaseOption,
      name: '国内网站',
      type: 'select',
      proxies: ['直连', '默认节点', ...regionGroupNames],
      url: 'https://wifi.vivo.com.cn/generate_204',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/StreamingCN.png',
    }
  )

  // 3.5 组装最终结果
  config['proxy-groups'] = [
    ...functionalGroups,
    ...generatedRegionGroups.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
  ]

  config['rules'] = rules
  config['rule-providers'] = ruleProviders

  return config
}
