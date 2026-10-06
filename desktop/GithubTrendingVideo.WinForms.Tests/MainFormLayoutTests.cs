using System.Runtime.ExceptionServices;
using System.Threading;
using GitHubTrendingVideo;
using System.Windows.Forms;

namespace GithubTrendingVideo.WinForms.Tests;

[TestClass]
public sealed class MainFormLayoutTests
{
    [TestMethod]
    public void Navigation_names_the_work_area_instead_of_repeating_the_action()
    {
        OnSta(() =>
        {
            using var form = CreateMinimumSizeForm();
            Assert.IsTrue(FindControls<Button>(form).Any(button => button.Text == "视频制作"),
                "The navigation should name the product area, while the primary button names the action.");
        });
    }

    [TestMethod]
    public void Run_header_actions_fit_inside_the_header_at_the_minimum_window_size()
    {
        OnSta(() =>
        {
            using var form = CreateMinimumSizeForm();
            foreach (var text in new[] { "▶  生成本期视频", "停止", "打开输出", "重启应用" })
            {
                var button = FindControls<Button>(form).FirstOrDefault(control => control.Text == text);
                Assert.IsNotNull(button, $"Expected the run page action '{text}'.");
                Assert.IsTrue(button!.Parent!.ClientRectangle.Contains(button.Bounds),
                    $"Action '{text}' extends beyond its {button.Parent.ClientSize.Width}px header.");
            }
        });
    }

    [TestMethod]
    public void Workflow_cards_fit_the_available_width_at_the_minimum_window_size()
    {
        OnSta(() =>
        {
            using var form = CreateMinimumSizeForm();
            foreach (var button in FindControls<Button>(form).Where(control => control.Text == "重试此节点"))
            {
                var card = button.Parent!;
                var list = card.Parent!;
                Assert.IsTrue(card.Right <= list.ClientSize.Width - list.Padding.Right,
                    $"Workflow card is {card.Width}px wide inside a {list.ClientSize.Width}px node list.");
            }
        });
    }

    [TestMethod]
    public void Environment_refresh_action_fits_inside_its_header_at_the_minimum_window_size()
    {
        OnSta(() =>
        {
            using var form = CreateMinimumSizeForm();
            var button = FindControls<Button>(form).FirstOrDefault(control => control.Text == "重新检查");
            Assert.IsNotNull(button, "Expected the environment refresh action.");
            Assert.IsTrue(button!.Parent!.ClientRectangle.Contains(button.Bounds),
                $"Environment action extends beyond its {button.Parent.ClientSize.Width}px header.");
        });
    }

    [TestMethod]
    public void Every_button_stays_inside_the_form_client_area_at_the_minimum_window_size()
    {
        OnSta(() =>
        {
            using var form = CreateMinimumSizeForm();
            var client = form.RectangleToScreen(form.ClientRectangle);
            var tabs = FindControls<TabControl>(form).Single();
            for (var tabIndex = 0; tabIndex < tabs.TabPages.Count; tabIndex++)
            {
                tabs.SelectedIndex = tabIndex;
                Application.DoEvents();
                foreach (var button in FindControls<Button>(form).Where(control => control.Visible))
                {
                    var bounds = button.RectangleToScreen(button.ClientRectangle);
                    Assert.IsTrue(bounds.Left >= client.Left && bounds.Right <= client.Right,
                        $"Button '{button.Text}' is horizontally outside the form client area: {bounds} vs {client}.");
                }
            }
        });
    }

    private static MainForm CreateMinimumSizeForm()
    {
        var form = new MainForm { Size = new System.Drawing.Size(960, 680) };
        form.Show();
        Application.DoEvents();
        form.PerformLayout();
        return form;
    }

    private static IEnumerable<T> FindControls<T>(Control parent) where T : Control
    {
        foreach (Control child in parent.Controls)
        {
            if (child is T match) yield return match;
            foreach (var descendant in FindControls<T>(child)) yield return descendant;
        }
    }

    private static void OnSta(Action action)
    {
        Exception? error = null;
        var thread = new Thread(() =>
        {
            try { action(); }
            catch (Exception exception) { error = exception; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error is not null) ExceptionDispatchInfo.Capture(error).Throw();
    }
}
