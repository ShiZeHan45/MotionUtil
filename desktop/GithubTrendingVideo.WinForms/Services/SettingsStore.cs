using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GitHubTrendingVideo.Models;

namespace GitHubTrendingVideo.Services;

public sealed class SettingsStore(RuntimePaths paths)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private sealed class StoredSettings
    {
        public string ProjectDirectory { get; set; } = "";
        public string OutputDirectory { get; set; } = "";
        public string OpenAiBaseUrl { get; set; } = "https://api.openai.com/v1";
        public string OpenAiModel { get; set; } = "";
        public string OpenAiApiKey { get; set; } = "";
        public string GithubToken { get; set; } = "";
        public int TrendingTopN { get; set; } = 5;
        public string KokoroModel { get; set; } = "hexgrad/Kokoro-82M-v1.1-zh";
        public string KokoroVoice { get; set; } = "zf_001";
        public string KokoroDevice { get; set; } = "cpu";
        public decimal KokoroSpeed { get; set; } = 1.3m;
        public string RemotionBrowserExecutable { get; set; } = "";
    }

    public AppSettings Load()
    {
        try
        {
            if (!File.Exists(paths.SettingsFile)) return new AppSettings();
            var stored = JsonSerializer.Deserialize<StoredSettings>(File.ReadAllText(paths.SettingsFile), JsonOptions) ?? new StoredSettings();
            return new AppSettings
            {
                ProjectDirectory = stored.ProjectDirectory,
                OutputDirectory = stored.OutputDirectory,
                OpenAiBaseUrl = stored.OpenAiBaseUrl,
                OpenAiModel = stored.OpenAiModel,
                OpenAiApiKey = Unprotect(stored.OpenAiApiKey),
                GithubToken = Unprotect(stored.GithubToken),
                TrendingTopN = Math.Clamp(stored.TrendingTopN, 1, 20),
                KokoroModel = stored.KokoroModel,
                KokoroVoice = stored.KokoroVoice,
                KokoroDevice = stored.KokoroDevice,
                KokoroSpeed = stored.KokoroSpeed,
                RemotionBrowserExecutable = stored.RemotionBrowserExecutable,
            };
        }
        catch (Exception error)
        {
            throw new InvalidOperationException($"无法读取软件设置：{error.Message}", error);
        }
    }

    public void Save(AppSettings settings)
    {
        Directory.CreateDirectory(paths.AppDataRoot);
        var stored = new StoredSettings
        {
            ProjectDirectory = settings.ProjectDirectory,
            OutputDirectory = settings.OutputDirectory,
            OpenAiBaseUrl = settings.OpenAiBaseUrl.Trim().TrimEnd('/'),
            OpenAiModel = settings.OpenAiModel.Trim(),
            OpenAiApiKey = Protect(settings.OpenAiApiKey),
            GithubToken = Protect(settings.GithubToken),
            TrendingTopN = Math.Clamp(settings.TrendingTopN, 1, 20),
            KokoroModel = settings.KokoroModel.Trim(),
            KokoroVoice = settings.KokoroVoice.Trim(),
            KokoroDevice = settings.KokoroDevice,
            KokoroSpeed = settings.KokoroSpeed,
            RemotionBrowserExecutable = settings.RemotionBrowserExecutable.Trim(),
        };
        var temp = paths.SettingsFile + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(stored, JsonOptions), new UTF8Encoding(false));
        File.Move(temp, paths.SettingsFile, true);
    }

    private static string Protect(string value) => string.IsNullOrEmpty(value) ? "" : Convert.ToBase64String(Dpapi.Protect(Encoding.UTF8.GetBytes(value)));
    private static string Unprotect(string value) => string.IsNullOrEmpty(value) ? "" : Encoding.UTF8.GetString(Dpapi.Unprotect(Convert.FromBase64String(value)));

    private static class Dpapi
    {
        [StructLayout(LayoutKind.Sequential)] private struct DataBlob { public int Size; public IntPtr Data; }
        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool CryptProtectData(ref DataBlob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);
        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);
        [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);

        public static byte[] Protect(byte[] value) => Transform(value, true);
        public static byte[] Unprotect(byte[] value) => Transform(value, false);

        private static byte[] Transform(byte[] value, bool protect)
        {
            var input = new DataBlob { Size = value.Length, Data = Marshal.AllocHGlobal(value.Length) };
            try
            {
                Marshal.Copy(value, 0, input.Data, value.Length);
                DataBlob output;
                var success = protect
                    ? CryptProtectData(ref input, "GitHub Trending Video settings", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out output)
                    : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out output);
                if (!success) throw new CryptographicException(Marshal.GetLastWin32Error());
                try
                {
                    var result = new byte[output.Size];
                    Marshal.Copy(output.Data, result, 0, output.Size);
                    return result;
                }
                finally { LocalFree(output.Data); }
            }
            finally { Marshal.FreeHGlobal(input.Data); }
        }
    }
}
