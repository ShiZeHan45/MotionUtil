using System.IO.Pipes;
using System.Text;
using MotionVideoPipeline.Orchestrator;

namespace MotionVideoPipeline.App;

internal static class Program
{
    private const string MutexName = "Local\\MotionVideoPipeline.SingleInstance";
    private const string PipeName = "MotionVideoPipeline.SingleInstance.Commands";

    [STAThread]
    private static void Main(string[] args)
    {
        using var guard = new SingleInstanceGuard(MutexName);
        if (!guard.TryAcquire())
        {
            SendActivation(args);
            return;
        }

        ApplicationConfiguration.Initialize();
        using var form = new MainForm();
        _ = ListenForActivationAsync(form);
        Application.Run(form);
    }

    private static void SendActivation(string[] args)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(500);
            var payload = string.Join("\n", args);
            var bytes = Encoding.UTF8.GetBytes(payload);
            client.Write(bytes, 0, bytes.Length);
        }
        catch { /* 主实例尚未开始监听时，二次启动安全退出 */ }
    }

    private static async Task ListenForActivationAsync(MainForm form)
    {
        while (!form.IsDisposed)
        {
            try
            {
                using var server = new NamedPipeServerStream(PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                await server.WaitForConnectionAsync();
                using var reader = new StreamReader(server, Encoding.UTF8);
                var args = await reader.ReadToEndAsync();
                form.BeginInvoke(() => form.ActivateFromSecondInstance(args));
            }
            catch (ObjectDisposedException) { return; }
            catch { await Task.Delay(200); }
        }
    }
}
