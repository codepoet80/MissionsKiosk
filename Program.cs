using System.Text.Json.Nodes;

var builder = WebApplication.CreateBuilder(args);

// Runs as a real Windows Service when the Service Control Manager starts it
// (no-op otherwise — running via `dotnet run` or double-click still works
// exactly as before). This is what lets the server start at boot, before
// anyone logs in, and lets Windows restart it automatically if it crashes.
builder.Host.UseWindowsService();

var app = builder.Build();

// Where each missionary/ministry's own folder lives: <dataDir>/<name>/profile.json
// plus whatever photos that folder references by filename. Defaults to a local
// "data" folder for easy dev/testing; set "DataDirectory" in appsettings.json to
// point at a synced folder (OneDrive, a network share, ...) so someone else can
// edit entries from another computer.
var dataDir = builder.Configuration["DataDirectory"] is { Length: > 0 } configured
    ? configured
    : Path.Combine(builder.Environment.ContentRootPath, "data");
Directory.CreateDirectory(dataDir);

// Serve the frontend (wwwroot) and the data folder's media files.
//
// The frontend files get "no-cache" (not "no-store"): the browser still
// revalidates with the server on every load (cheap — a 304 if unchanged),
// but never silently keeps serving a stale index.html/app.js/styles.css from
// its disk cache without checking. Without this, a kiosk browser window
// left open for days could go on rendering an old version indefinitely
// after we edit a file, since these are small text files with no natural
// cache-busting (unlike the versioned-looking library files under /lib).
// Photos/PDFs/videos under /data keep normal caching — they're bigger,
// change less often, and a stale one for a few minutes is harmless.
app.UseDefaultFiles();
app.UseStaticFiles(new Microsoft.AspNetCore.Builder.StaticFileOptions
{
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
});
app.UseStaticFiles(new Microsoft.AspNetCore.Builder.StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(dataDir),
    RequestPath = "/data"
});

// Scans dataDir for one subfolder per missionary/ministry — each containing a
// single .json file (any name; "profile.json" by convention) plus that
// entry's own photos, referenced by filename. The folder name IS the id (so
// renaming a folder is all it takes to change one), and it's also the URL
// path media is served under (see the /data static mapping above). A folder
// name starting with "_" or "." is ignored — handy for a "_template" folder
// to copy from. A bad or missing .json file is reported and skipped, not
// fatal to the rest.
app.MapGet("/api/ministries", () =>
{
    var results = new List<JsonNode>();
    var errors = new List<object>();

    foreach (var folder in Directory.EnumerateDirectories(dataDir).OrderBy(f => f))
    {
        var id = Path.GetFileName(folder);
        if (id.StartsWith('_') || id.StartsWith('.')) continue;

        var jsonFiles = Directory.EnumerateFiles(folder, "*.json", SearchOption.TopDirectoryOnly)
            .OrderBy(f => f)
            .ToList();

        if (jsonFiles.Count == 0)
        {
            errors.Add(new { folder = id, error = "No .json file found in this folder — skipped." });
            continue;
        }

        try
        {
            var node = JsonNode.Parse(File.ReadAllText(jsonFiles[0]))!.AsObject();
            node["id"] = id; // folder name always wins, so it can't drift from the JSON's own idea of its id
            results.Add(node);

            if (jsonFiles.Count > 1)
            {
                var ignored = string.Join(", ", jsonFiles.Skip(1).Select(Path.GetFileName));
                errors.Add(new { folder = id, warning = $"Multiple .json files found; used '{Path.GetFileName(jsonFiles[0])}', ignored: {ignored}" });
            }
        }
        catch (Exception ex)
        {
            errors.Add(new { folder = id, error = ex.Message });
        }
    }

    return Results.Ok(new { count = results.Count, ministries = results, errors });
});

// Fixed port, not left to Kestrel's default (5000/5001) — launchSettings.json
// (which set 5103 during `dotnet run` testing) is a dev-only convenience
// file that's never published and has no effect on the built app, so
// without this the published exe would silently listen on a different port
// than every URL in the frontend, this README, and the kiosk launch script
// expect.
app.Run("http://localhost:5103");
