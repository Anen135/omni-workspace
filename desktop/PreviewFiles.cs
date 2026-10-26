using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace OmniDesktop {
internal static class PreviewFiles {
    const int Limit = 1 * 1024 * 1024 * 1024;
    sealed class FileSource { public string Host; public string[] Prefixes; public bool FileId; }
    static readonly FileSource[] Sources = ReadSources();
    static FileSource[] ReadSources() {
        using (var stream = typeof(PreviewFiles).Assembly.GetManifestResourceStream("file-sources.json"))
        using (var reader = new StreamReader(stream)) {
            var configuration = new JavaScriptSerializer().DeserializeObject(reader.ReadToEnd()) as Dictionary<string, object>;
            if (configuration == null || configuration.Count != 1 || !configuration.ContainsKey("sources") || !(configuration["sources"] is object[] entries) || entries.Length == 0) throw new InvalidOperationException("Invalid file source configuration.");
            var sources = new List<FileSource>();
            var hosts = new HashSet<string>(StringComparer.Ordinal);
            foreach (var entry in entries) {
                var source = entry as Dictionary<string, object>;
                if (source == null || source.Keys.Any(key => key != "host" && key != "pathPrefixes" && key != "fileId") || !source.ContainsKey("host") || !(source["host"] is string host) || !Regex.IsMatch(host, "^[a-z0-9]+(?:[.-][a-z0-9]+)*\\.[a-z]{2,}$") || !hosts.Add(host) || !source.ContainsKey("pathPrefixes") || !(source["pathPrefixes"] is object[] paths) || paths.Length == 0 || paths.Any(path => !(path is string prefix) || !Regex.IsMatch(prefix, "^/(?:[A-Za-z0-9_-]+/)+$")) || paths.Distinct().Count() != paths.Length || source.ContainsKey("fileId") && !(source["fileId"] is bool)) throw new InvalidOperationException("Invalid file source configuration.");
                sources.Add(new FileSource { Host = host, Prefixes = paths.Cast<string>().ToArray(), FileId = source.ContainsKey("fileId") && (bool)source["fileId"] });
            }
            return sources.ToArray();
        }
    }
    internal static bool Allowed(Uri uri) => uri.Scheme == "https" && uri.IsDefaultPort && uri.UserInfo == "" &&
        Sources.Any(source => uri.Host == source.Host && source.Prefixes.Any(prefix =>
            uri.AbsolutePath.StartsWith(prefix, StringComparison.Ordinal) &&
            (!source.FileId || Regex.IsMatch(uri.AbsolutePath.Substring(prefix.Length), "^[A-Za-z0-9_-]+$"))));
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
