using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace OmniDesktop {
internal static class PreviewFiles {
    const int Limit = 8 * 1024 * 1024;
    internal static bool Allowed(Uri uri) => uri.Scheme == "https" && uri.IsDefaultPort && uri.UserInfo == "" && (
        uri.Host == "fs.top-academy.ru" && Regex.IsMatch(uri.AbsolutePath, "^/api/v1/files/[A-Za-z0-9_-]+$") ||
        uri.Host == "storage.yandexcloud.net" && uri.AbsolutePath.StartsWith("/top-academy-services-omni/", StringComparison.Ordinal));
    internal static async Task<object> Load(string address) {
        using (var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
        using (var client = new HttpClient(handler))
        using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30))) {
            var uri = new Uri(address);
            for (var n = 0; n <= 4; n++) {
                if (!Allowed(uri)) throw new InvalidOperationException();
                using (var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, timeout.Token)) {
                    var status = (int)response.StatusCode;
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        if (response.Headers.Location == null) throw new InvalidOperationException();
                        uri = new Uri(uri, response.Headers.Location); continue;
                    }
                    response.EnsureSuccessStatusCode();
                    if (response.Content.Headers.ContentLength > Limit) throw new InvalidOperationException();
                    using (var stream = await response.Content.ReadAsStreamAsync())
                    using (var data = new MemoryStream()) {
                        var buffer = new byte[65536]; int count;
                        while ((count = await stream.ReadAsync(buffer, 0, buffer.Length, timeout.Token)) > 0) {
                            if (data.Length + count > Limit) throw new InvalidOperationException();
                            data.Write(buffer, 0, count);
                        }
                        var bytes = data.ToArray(); var prefix = Encoding.ASCII.GetString(bytes, 0, Math.Min(12, bytes.Length));
                        string type;
                        if (prefix.StartsWith("%PDF-")) type = "application/pdf";
                        else if (bytes.Length >= 8 && bytes[0] == 137 && prefix.Substring(1, 3) == "PNG") type = "image/png";
                        else if (bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255) type = "image/jpeg";
                        else if (prefix.StartsWith("GIF87a") || prefix.StartsWith("GIF89a")) type = "image/gif";
                        else if (prefix.StartsWith("RIFF") && prefix.EndsWith("WEBP")) type = "image/webp";
                        else throw new InvalidOperationException();
                        return new { type, base64 = Convert.ToBase64String(bytes) };
                    }
                }
            }
            throw new InvalidOperationException();
        }
    }
}
}
