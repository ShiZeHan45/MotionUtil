using System.Diagnostics;
using System.Runtime.InteropServices;

namespace GitHubTrendingVideo;

internal static class Program
{
    private const string MutexName = "Local\\GitHubTrendingVideo.SingleInstance";
    private const int SwRestore = 9;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [STAThread]
    private static void Main(string[] args)
    {
        WaitForRestartParent(args);
        using var mutex = new Mutex(true, MutexName, out var createdNew);
        if (!createdNew)
        {
            ActivateExistingInstance();
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }

    private static void WaitForRestartParent(string[] args)
    {
        if (args.Length < 2 || !string.Equals(args[0], "--wait-for-parent", StringComparison.OrdinalIgnoreCase) || !int.TryParse(args[1], out var parentId)) return;
        try { using var parent = Process.GetProcessById(parentId); parent.WaitForExit(); }
        catch (ArgumentException) { }
    }

    private static void ActivateExistingInstance()
    {
        var current = Process.GetCurrentProcess();
        var existing = Process.GetProcessesByName(current.ProcessName)
            .Where(process => process.Id != current.Id)
            .OrderBy(process => process.StartTime)
            .FirstOrDefault(process => process.MainWindowHandle != IntPtr.Zero);
        if (existing is null) return;

        ShowWindowAsync(existing.MainWindowHandle, SwRestore);
        SetForegroundWindow(existing.MainWindowHandle);
        existing.Dispose();
    }
}
