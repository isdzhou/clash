# Clash Party / Clash Verge Rev 覆写脚本(加固精简版)

基于 [dahaha-365 / YaNet](https://github.com/dahaha-365/YaNet) 修改而来,适用于 Clash Party 与 Clash Verge Rev 的覆写(Override)脚本。

本版本**不再处理 DNS、TUN、域名嗅探**,请在软件界面里单独设置。

## 相对原版的修改

1. **删除 `dns` / `tun` / `sniffer` 三部分配置**,交给软件管理。
2. **控制接口默认关闭**;开启时必须自行设置 `secret`,CORS 不再是 `*`。
3. **默认不对局域网开放**(`allow-lan=false`,绑定 `127.0.0.1`)。
4. **不再设置** `port` / `socks-port` / `redir-port` / `tproxy-port`;混合端口默认沿用软件设置。
5. **默认不下载 zashboard 面板**(需要时才开启)。
6. **远程控制端口直连规则改为开关**(默认开启,与原版行为一致),并去掉重复项。
7. **修复 `enable` 永远为 `true` 的问题**;修复无 `proxies` 字段时 `push` 报错。
8. **修复 Pixiv 测速地址误用 Spotify 的问题**。
9. **补上 `no-resolve`**:给 `GEOIP`、`telegram` 以及含 IP 条目的 `RULE-SET` 加上 `no-resolve`,避免规则模式下内核为匹配 IP 规则而在本地解析域名(DNS 泄露来源)。
10. **新增可开关的 STUN/WebRTC UDP 分流规则**(`proxyStunUdp`),只让 STUN 流量走代理。

## 致谢

- 原项目:[dahaha-365/YaNet](https://github.com/dahaha-365/YaNet)
