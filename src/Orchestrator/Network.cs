using System.Net;
using System.Diagnostics;
using Microsoft.Win32;

namespace MotionVideoPipeline.Orchestrator;

public static class SystemNetwork
{
    public static HttpClient CreateHttpClient(string userAgent)
    {
        var handler = new HttpClientHandler();
        var proxy = ResolveWindowsProxy();
        if (proxy is not null)
        {
            handler.Proxy = new WebProxy(proxy);
            handler.UseProxy = true;
        }

        var client = new HttpClient(handler);
        client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        return client;
    }

    public static Uri? ResolveWindowsProxy()
    {
        if (!OperatingSystem.IsWindows()) return null;
        try
        {
            using var settings = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings");
            if (settings?.GetValue("ProxyEnable") is not 1) return null;
            var proxyServer = settings.GetValue("ProxyServer") as string;
            if (string.IsNullOrWhiteSpace(proxyServer)) return null;
            var values = ParseProxyServer(proxyServer);
            return values.TryGetValue("https", out var https) && Uri.TryCreate(https, UriKind.Absolute, out var httpsUri)
                ? httpsUri
                : values.TryGetValue("http", out var http) && Uri.TryCreate(http, UriKind.Absolute, out var httpUri) ? httpUri : null;
        }
        catch (Exception) when (OperatingSystem.IsWindows())
        {
            return null;
        }
    }

    public static IReadOnlyDictionary<string, string> ParseProxyServer(string value)
    {
        var entries = value.Contains(';')
            ? value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : ["http=" + value, "https=" + value];
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in entries)
        {
            var separator = entry.IndexOf('=');
            var scheme = separator > 0 ? entry[..separator].Trim() : "http";
            var address = separator > 0 ? entry[(separator + 1)..].Trim() : entry.Trim();
            if (address.Length == 0) continue;
            if (!address.Contains("://", StringComparison.Ordinal)) address = "http://" + address;
            result[scheme] = address;
        }
        return result;
    }

    public static void ConfigureNodeProxy(ProcessStartInfo startInfo)
    {
        if (!OperatingSystem.IsWindows() || HasProxyEnvironment(startInfo)) return;
        try
        {
            using var settings = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings");
            if (settings?.GetValue("ProxyEnable") is not 1) return;
            var proxyServer = settings.GetValue("ProxyServer") as string;
            if (string.IsNullOrWhiteSpace(proxyServer)) return;
            var values = ParseProxyServer(proxyServer);
            if (values.TryGetValue("http", out var http)) startInfo.Environment["HTTP_PROXY"] = http;
            if (values.TryGetValue("https", out var https)) startInfo.Environment["HTTPS_PROXY"] = https;
            if (!values.ContainsKey("https") && values.TryGetValue("http", out http)) startInfo.Environment["HTTPS_PROXY"] = http;
            if (settings.GetValue("ProxyOverride") is string bypass && !string.IsNullOrWhiteSpace(bypass))
                startInfo.Environment["NO_PROXY"] = bypass.Replace(';', ',');
        }
        catch (Exception) when (OperatingSystem.IsWindows())
        {
            // Proxy discovery is optional; direct access remains available when the registry is unreadable.
        }
    }

    private static bool HasProxyEnvironment(ProcessStartInfo startInfo) =>
        startInfo.Environment.Keys.Any(key => key.Equals("HTTP_PROXY", StringComparison.OrdinalIgnoreCase)
            || key.Equals("HTTPS_PROXY", StringComparison.OrdinalIgnoreCase)
            || key.Equals("ALL_PROXY", StringComparison.OrdinalIgnoreCase));
}
