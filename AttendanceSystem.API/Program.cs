using AttendanceSystem.API.Authorization;
using AttendanceSystem.API.BL;
using AttendanceSystem.API.DB;
using AttendanceSystem.API.DB.Auth;
using AttendanceSystem.API.Repository;
using CECB.Shared.Authorization.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.IO;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

builder.Services.AddMemoryCache();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "DataProtectionKeys")));
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Attendance System API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// --- Database Contexts ---
// New standalone DB (AttendanceSystemDB) — owns user accounts
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("AttendanceSystemDB"),
        sql => sql.UseCompatibilityLevel(120)));

// Central Auth DB is read-only here; it is used only to resolve AGM/Clerk assigned work units.
builder.Services.AddDbContext<CecbAuthDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("CECBAuth"),
        sql => sql.UseCompatibilityLevel(120)));

// Existing read-only fingerprint data
builder.Services.AddDbContext<AttendanceERPDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("AttendanceERP"),
        sql => sql.UseCompatibilityLevel(120)));

// Existing ERP employee data
builder.Services.AddDbContext<ERPDBContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("ServerERP"),
        sql => sql.UseCompatibilityLevel(120)));

// Existing leave DB (work schedules / in-out times)
builder.Services.AddDbContext<LeaveDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("LeaveDb"),
        sql => sql.UseCompatibilityLevel(120)));

// --- CORS ---
builder.Services.AddCors(options =>
    options.AddPolicy("ConfiguredOrigins", p =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ??
        [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://localhost:3003",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://127.0.0.1:3002",
            "http://127.0.0.1:3003"
        ];

        p.WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    }));

// --- Services ---
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AttendanceRepository>();
builder.Services.AddScoped<AttendanceAccessService>();
builder.Services.AddScoped<AuthBL>();
builder.Services.AddHostedService<AttendanceSystem.API.Services.CacheWarmupService>();

// --- JWT Auth ---
var jwtSections = new[]
{
    builder.Configuration.GetSection("JwtSettings"),
    builder.Configuration.GetSection("CentralJwtSettings")
}
    .Where(s => !string.IsNullOrWhiteSpace(s["Issuer"]) &&
                !string.IsNullOrWhiteSpace(s["Audience"]) &&
                !string.IsNullOrWhiteSpace(s["SecretKey"]))
    .ToArray();

if (jwtSections.Length == 0)
    throw new InvalidOperationException("At least one JWT settings section with Issuer, Audience and SecretKey is required.");

var validIssuers = jwtSections.Select(s => s["Issuer"]!).Distinct().ToArray();
var validAudiences = jwtSections.Select(s => s["Audience"]!).Distinct().ToArray();
var signingKeys = jwtSections
    .Select(s => new SymmetricSecurityKey(Encoding.UTF8.GetBytes(s["SecretKey"]!)))
    .ToArray();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.RequireHttpsMetadata = false;
        o.SaveToken = true;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuers = validIssuers,
            ValidAudiences = validAudiences,
            IssuerSigningKeyResolver = (_, _, _, _) => signingKeys,
            NameClaimType = "userId",
            ClockSkew = TimeSpan.Zero
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCecbPermissionAuthorization();

var app = builder.Build();

// Auto-create AttendanceSystemDB tables and seed default admin for local/development use.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    await AppDatabaseInitializer.EnsureOperationalTablesAsync(db);

    var seedDefaultAdmin = app.Configuration.GetValue<bool?>("DefaultAdmin:Enabled") ?? app.Environment.IsDevelopment();
    var adminUsername = app.Configuration["DefaultAdmin:Username"] ?? "admin";
    var adminPassword = app.Configuration["DefaultAdmin:Password"] ?? (app.Environment.IsDevelopment() ? "Admin@1234" : null);

    if (seedDefaultAdmin && !string.IsNullOrWhiteSpace(adminPassword) && !db.Users.Any(u => u.Username == adminUsername))
    {
        db.Users.Add(new AttendanceSystem.API.DB.Models.AppUser
        {
            Username = adminUsername,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
            Role = "Admin",
            FullName = "System Administrator",
            IsActive = true
        });
        db.SaveChanges();
    }
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseRouting();
app.UseCors("ConfiguredOrigins");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
