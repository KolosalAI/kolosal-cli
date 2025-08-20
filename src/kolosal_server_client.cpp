#include "kolosal_server_client.h"
#include "http_client.h"
#include "loading_animation.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <regex>
#include <fstream>
#include <filesystem>
#include <vector>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>
#include <cstdlib>  // for _dupenv_s
#elif defined(__APPLE__)
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <dirent.h>
#include <cstring>
#include <cstdlib>
#include <cerrno>
#include <mach-o/dyld.h>
#include <libproc.h>
#include <sys/sysctl.h>
#else
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <dirent.h>
#include <cstring>
#include <cstdlib>
#include <cerrno>
#endif

using json = nlohmann::json;

// Cross-platform helper functions
#ifdef _WIN32
    #define PATH_SEPARATOR "\\"
    #define EXECUTABLE_EXTENSION ".exe"
#else
    #define PATH_SEPARATOR "/"
    #define EXECUTABLE_EXTENSION ""
#endif

// Cross-platform process ID type
#ifdef _WIN32
typedef DWORD ProcessId;
#else
typedef pid_t ProcessId;
#endif

// Helper function to get executable path
std::string getExecutablePath() {
#ifdef _WIN32
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    return std::string(exePath);
#elif defined(__APPLE__)
    // macOS: Use _NSGetExecutablePath
    char exePath[1024];
    uint32_t size = sizeof(exePath);
    if (_NSGetExecutablePath(exePath, &size) == 0) {
        // Resolve symbolic links if any
        char resolvedPath[1024];
        if (realpath(exePath, resolvedPath) != nullptr) {
            return std::string(resolvedPath);
        } else {
            return std::string(exePath);
        }
    }
    return "";
#else
    // Linux: Use /proc/self/exe
    char exePath[1024];
    ssize_t len = readlink("/proc/self/exe", exePath, sizeof(exePath) - 1);
    if (len != -1) {
        exePath[len] = '\0';
        return std::string(exePath);
    }
    return "";
#endif
}

// Helper function to check if file exists
bool fileExists(const std::string& path) {
    return std::filesystem::exists(path) && std::filesystem::is_regular_file(path);
}

// Helper function to find server process ID
ProcessId findServerProcess() {
#ifdef _WIN32
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) {
        return 0;
    }

    PROCESSENTRY32W pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32W);

    if (!Process32FirstW(hSnapshot, &pe32)) {
        CloseHandle(hSnapshot);
        return 0;
    }

    ProcessId serverPid = 0;
    do {
        if (_wcsicmp(pe32.szExeFile, L"kolosal-server.exe") == 0) {
            serverPid = pe32.th32ProcessID;
            break;
        }
    } while (Process32NextW(hSnapshot, &pe32));

    CloseHandle(hSnapshot);
    return serverPid;
#elif defined(__APPLE__)
    // On macOS, use proc_listpids and proc_pidpath to find the process
    pid_t pids[1024];
    int numberOfPids = proc_listpids(PROC_ALL_PIDS, 0, pids, sizeof(pids));
    numberOfPids = numberOfPids / sizeof(pid_t);
    
    for (int i = 0; i < numberOfPids; ++i) {
        if (pids[i] == 0) continue;
        
        char pathBuffer[PROC_PIDPATHINFO_MAXSIZE];
        int ret = proc_pidpath(pids[i], pathBuffer, sizeof(pathBuffer));
        if (ret > 0) {
            std::string processPath(pathBuffer);
            // Check if this process is kolosal-server
            if (processPath.find("kolosal-server") != std::string::npos) {
                return pids[i];
            }
        }
    }
    return 0;
#else
    // On Linux, search through /proc for the process
    DIR* procDir = opendir("/proc");
    if (!procDir) return 0;

    struct dirent* entry;
    while ((entry = readdir(procDir)) != nullptr) {
        // Check if directory name is a number (PID)
        if (strspn(entry->d_name, "0123456789") == strlen(entry->d_name)) {
            std::string cmdlinePath = "/proc/" + std::string(entry->d_name) + "/cmdline";
            std::ifstream cmdlineFile(cmdlinePath);
            if (cmdlineFile.is_open()) {
                std::string cmdline;
                std::getline(cmdlineFile, cmdline);
                cmdlineFile.close();
                
                // Check if this process is kolosal-server
                if (cmdline.find("kolosal-server") != std::string::npos) {
                    closedir(procDir);
                    return std::stoi(entry->d_name);
                }
            }
        }
    }
    closedir(procDir);
    return 0;
#endif
}

// Helper function to terminate process
bool terminateProcess(ProcessId pid) {
#ifdef _WIN32
    HANDLE hProcess = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (hProcess != NULL) {
        bool success = TerminateProcess(hProcess, 0);
        CloseHandle(hProcess);
        return success;
    }
    return false;
#else
    return kill(pid, SIGTERM) == 0;
#endif
}

KolosalServerClient::KolosalServerClient(const std::string &baseUrl, const std::string &apiKey)
    : m_baseUrl(baseUrl), m_apiKey(apiKey)
{
}

KolosalServerClient::~KolosalServerClient()
{
}

bool KolosalServerClient::startServer(const std::string &serverPath, int port)
{
    if (isServerHealthy())
    {
        return true;
    }

    std::string actualServerPath = serverPath;
    if (actualServerPath.empty())
    {
        std::string exePath = getExecutablePath();
        if (exePath.empty()) {
            std::cerr << "Error: Could not determine executable path" << std::endl;
            return false;
        }
        
        std::string exeDir = exePath.substr(0, exePath.find_last_of(PATH_SEPARATOR));

        // Priority 1: Try same directory as CLI (highest priority for Windows)
        std::string sameDirPath = exeDir + PATH_SEPARATOR + "kolosal-server" + EXECUTABLE_EXTENSION;
        if (fileExists(sameDirPath))
        {
            actualServerPath = sameDirPath;
        }
        else
        {
            // Priority 2: Try kolosal-server subdirectory (common for extracted packages)
            std::string subDirPath = exeDir + PATH_SEPARATOR + "kolosal-server" + PATH_SEPARATOR + "kolosal-server" + EXECUTABLE_EXTENSION;
            if (fileExists(subDirPath))
            {
                actualServerPath = subDirPath;
            }
            else
            {
                // Priority 3: Try parent/server-bin directory (Windows package structure)
                std::string parentDir = exeDir.substr(0, exeDir.find_last_of(PATH_SEPARATOR));
                std::string serverBinPath = parentDir + PATH_SEPARATOR + "server-bin" + PATH_SEPARATOR + "kolosal-server" + EXECUTABLE_EXTENSION;
                if (fileExists(serverBinPath))
                {
                    actualServerPath = serverBinPath;
                }
                else
                {
                    // Priority 4: Try build directory (development environment)
                    std::string buildPath = parentDir + PATH_SEPARATOR + "build" + PATH_SEPARATOR + "kolosal-server" + PATH_SEPARATOR + "kolosal-server" + EXECUTABLE_EXTENSION;
                    std::cout << "Checking build directory: " << buildPath << std::endl;
                    if (fileExists(buildPath))
                    {
                        actualServerPath = buildPath;
                    }
                    else
                    {
                        // Last resort: Fall back to system PATH
                        actualServerPath = "kolosal-server" + std::string(EXECUTABLE_EXTENSION);
                    }
                }
            }
        }
    } 
    else 
    {
        std::cout << "Using provided server path: " << actualServerPath << std::endl;
    }
    
    // Verify the server path exists before attempting to start
    if (!actualServerPath.empty() && actualServerPath != "kolosal-server" + std::string(EXECUTABLE_EXTENSION))
    {
        if (!fileExists(actualServerPath))
        {
            std::cerr << "Error: Server executable not found at: " << actualServerPath << std::endl;
            return false;
        }
    } 
    
#ifdef _WIN32
    // Build command line using the actual server path
    std::string commandLine;
    if (actualServerPath == "kolosal-server.exe") {
        commandLine = "kolosal-server.exe";
    } else {
        commandLine = "\"" + actualServerPath + "\"";
    }
    
    // Use the same directory as the CLI executable for config.yaml access
    std::string workingDir;
    
    // Priority 1: Use the same directory as the CLI executable (for config.yaml access)
    std::string exePath = getExecutablePath();
    if (!exePath.empty()) {
        std::string exeDir = exePath.substr(0, exePath.find_last_of(PATH_SEPARATOR));
        // Check if we can write to the exe directory (for logs, temp files, etc.)
        std::string testFile = exeDir + PATH_SEPARATOR + "test_write.tmp";
        std::ofstream testWrite(testFile);
        if (testWrite.is_open()) {
            testWrite.close();
            std::filesystem::remove(testFile);
            workingDir = exeDir;
        }
    }
    
    // Fallback: Use user profile or temp if exe directory is not writable
    if (workingDir.empty()) {
        char* userProfile = nullptr;
        size_t len = 0;
        if (_dupenv_s(&userProfile, &len, "USERPROFILE") == 0 && userProfile != nullptr) {
            workingDir = std::string(userProfile);
            free(userProfile);
            std::cout << "Using user profile as working directory: " << workingDir << std::endl;
        } else {
            // Final fallback to temp directory
            char* tempDir = nullptr;
            if (_dupenv_s(&tempDir, &len, "TEMP") == 0 && tempDir != nullptr) {
                workingDir = std::string(tempDir);
                free(tempDir);
            } else {
                workingDir = "C:\\temp";
            }
            std::cout << "Using temp directory as working directory: " << workingDir << std::endl;
        }
    }
    
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    ZeroMemory(&pi, sizeof(pi));
    
    BOOL result = CreateProcessA(
        (actualServerPath == "kolosal-server.exe") ? NULL : actualServerPath.c_str(),
        const_cast<char *>(commandLine.c_str()),
        NULL,
        NULL,
        FALSE,
        DETACHED_PROCESS,
        NULL,
        workingDir.c_str(),
        &si,
        &pi
    );

    if (!result)
    {
        DWORD error = GetLastError();
        switch (error)
        {
        case ERROR_FILE_NOT_FOUND:
            std::cerr << "Error: Server executable not found. Please ensure kolosal-server.exe is available." << std::endl;
            break;
        case ERROR_ACCESS_DENIED:
            std::cerr << "Error: Access denied. Please run as administrator if necessary." << std::endl;
            break;
        default:
            std::cerr << "Error: Failed to start server (code: " << error << ")" << std::endl;
            break;
        }
        return false;
    }

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
#else
    // Check if the file is executable
    if (access(actualServerPath.c_str(), X_OK) != 0) {
        std::cerr << "Error: Server binary is not executable: " << actualServerPath << std::endl;
        std::cerr << "Try running: chmod +x " << actualServerPath << std::endl;
        return false;
    }
    
    pid_t pid = fork();
    if (pid == 0) {
        // Child process
        // Change working directory to prioritize config.yaml access
        std::string workingDir;
        
        // Priority 1: Use the same directory as the CLI executable (for config.yaml access)
        std::string exePath = getExecutablePath();
        if (!exePath.empty()) {
            std::string exeDir = exePath.substr(0, exePath.find_last_of(PATH_SEPARATOR));
            // Check if we can write to the exe directory
            if (access(exeDir.c_str(), W_OK) == 0) {
                workingDir = exeDir;
            }
        }
        
        // Fallback: Use system directories if exe directory is not writable
        if (workingDir.empty()) {
            // Try to use /var/lib/kolosal if it exists and is writable
            if (access("/var/lib/kolosal", W_OK) == 0) {
                workingDir = "/var/lib/kolosal";
                std::cerr << "Using /var/lib/kolosal as working directory: " << workingDir << std::endl;
            }
            // Otherwise use user's home directory
            else {
                const char* homeDir = getenv("HOME");
                if (homeDir) {
                    workingDir = std::string(homeDir);
                    std::cerr << "Using home directory as working directory: " << workingDir << std::endl;
                } else {
                    workingDir = "/tmp";  // Last resort
                    std::cerr << "Using /tmp as working directory: " << workingDir << std::endl;
                }
            }
        }
        
        if (chdir(workingDir.c_str()) != 0) {
            std::cerr << "Warning: Could not change to chosen directory: " << workingDir << std::endl;
            // Try /tmp as absolute last resort
            if (chdir("/tmp") != 0) {
                std::cerr << "Error: Could not change to any writable directory" << std::endl;
            } else {
                std::cerr << "Using /tmp as fallback working directory" << std::endl;
            }
        }
        
        // Execute the server in background (detached)
        setsid(); // Create new session
        
        // For debugging, redirect to log files instead of /dev/null temporarily
        // This will help us see what's happening with the server startup
        std::string logPath = "/tmp/kolosal-server.log";
        freopen(logPath.c_str(), "w", stdout);
        freopen(logPath.c_str(), "w", stderr);
        
        // Execute with config parameter if available
        execl(actualServerPath.c_str(), "kolosal-server", nullptr);
        
        // If execl fails, log the error and exit child process
        std::cerr << "Failed to execute server: " << actualServerPath << std::endl;
        std::cerr << "Error: " << strerror(errno) << std::endl;
        _exit(1);
    } else if (pid < 0) {
        // Fork failed
        std::cerr << "Error: Failed to start server process: " << strerror(errno) << std::endl;
        return false;
    }
    
    // Give the server a moment to start before returning
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
#endif

    return true;
}

bool KolosalServerClient::isServerHealthy()
{
    std::string response;
    if (!makeGetRequest("/v1/health", response))
    {
        return false;
    }

    try
    {
        json healthJson = json::parse(response);
        std::string status = healthJson.value("status", "");
        return status == "healthy";
    }
    catch (const std::exception &)
    {
        return false;
    }
}

bool KolosalServerClient::waitForServerReady(int timeoutSeconds)
{
    auto startTime = std::chrono::steady_clock::now();
    auto timeout = std::chrono::seconds(timeoutSeconds);

    LoadingAnimation loading("Waiting for server to start");
    loading.start();

    while (std::chrono::steady_clock::now() - startTime < timeout)
    {
        if (isServerHealthy())
        {
            loading.complete("Server started successfully");
            return true;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }

    loading.stop();
    return false;
}

bool KolosalServerClient::getEngines(std::vector<std::string>& engines)
{
    std::string response;
    
    // Use the unified models endpoint
    if (!makeGetRequest("/models", response))
    {
        return false;
    }

    try
    {
        json modelsJson = json::parse(response);
        engines.clear();
        
        // Handle the unified models response format
        if (modelsJson.contains("models") && modelsJson["models"].is_array())
        {
            for (const auto& model : modelsJson["models"])
            {
                if (model.contains("model_id"))
                {
                    engines.push_back(model["model_id"].get<std::string>());
                }
            }
        }
        
        return true;
    }
    catch (const std::exception&)
    {
        return false;
    }
}

bool KolosalServerClient::engineExists(const std::string& engineId)
{
    std::vector<std::string> engines;
    if (!getEngines(engines))
    {
        return false;
    }
    
    for (const auto& engine : engines)
    {
        if (engine == engineId)
        {
            return true;
        }
    }
    
    return false;
}

bool KolosalServerClient::addEngine(const std::string &engineId, const std::string &modelUrl,
                                    const std::string &modelPath)
{
    try
    {
        // No loading animation for cleaner output - just show final result
        json payload;
        payload["model_id"] = engineId;
        payload["model_path"] = modelUrl; // For download, we pass URL as model_path
        // Server requires an explicit model_type: "llm" or "embedding"
        // Default to LLM; use a light heuristic to detect embedding models by name
        {
            std::string lowerId = engineId;
            std::transform(lowerId.begin(), lowerId.end(), lowerId.begin(), ::tolower);
            bool looksEmbedding = (lowerId.find("embed") != std::string::npos) ||
                                  (lowerId.find("embedding") != std::string::npos) ||
                                  (lowerId.find("text-embedding") != std::string::npos);
            payload["model_type"] = looksEmbedding ? "embedding" : "llm";
        }
        payload["load_immediately"] = false;
        payload["main_gpu_id"] = 0;
        
        // Set comprehensive loading parameters
        json loadParams;
        loadParams["n_ctx"] = 8192;
        loadParams["n_keep"] = 8192;
        loadParams["use_mmap"] = true;
        loadParams["use_mlock"] = true;
        loadParams["n_parallel"] = 1;
        loadParams["cont_batching"] = true;
        loadParams["warmup"] = false;
        loadParams["n_gpu_layers"] = 50;
        loadParams["n_batch"] = 2048;
        loadParams["n_ubatch"] = 512;
        loadParams["split_mode"] = 0;
        
        payload["loading_parameters"] = loadParams;

        std::string response;
        if (!makePostRequest("/models", payload.dump(), response))  // Using new model-based API endpoint
        {
            // Even on non-2xx, server may return a JSON error body; try to surface a meaningful failure
            try {
                json err = json::parse(response);
                if (err.contains("error") && err["error"].contains("message")) {
                    std::cerr << "Server error: " << err["error"]["message"].get<std::string>() << std::endl;
                }
            } catch (...) {}
            return false;
        }
        
        // Parse response to check if it was successful
        try {
            json responseJson = json::parse(response);
            
            // Check for error responses first
            if (responseJson.contains("error")) {
                auto error = responseJson["error"];
                std::string errorMessage = error.value("message", "Unknown error");
                std::string errorCode = error.value("code", "unknown");
                
                // Only treat "model_already_loaded" as a success case
                if (errorCode == "model_already_loaded") {
                    return true;
                }
                
                // For other errors, don't update config and return false
                std::cerr << "Server error: " << errorMessage << std::endl;
                return false;
            }
            
            // Check for success status codes
            if (responseJson.contains("status")) {
                std::string status = responseJson["status"];
                if (status == "loaded" || status == "created" || status == "downloading") {
                    // Server handles config updates automatically now
                    return true;
                }
            }
            
            // If no clear status, assume success for backward compatibility
            // Server handles config updates automatically now
            return true;
        } catch (const std::exception&) {
            // If we can't parse the response, still consider it successful if we got here
            // Server handles config updates automatically now
            return true;
        }
    }
    catch (const std::exception &)
    {
        return false;
    }
}

bool KolosalServerClient::getDownloadProgress(const std::string &modelId, long long &downloadedBytes,
                                              long long &totalBytes, double &percentage, std::string &status)
{
    std::string response;
    std::string endpoint = "/v1/downloads/" + modelId;

    // Try v1 endpoint first, then fallback to non-v1
    if (!makeGetRequest(endpoint, response))
    {
        endpoint = "/downloads/" + modelId;
        if (!makeGetRequest(endpoint, response))
        {
            // Check if response contains error indicating download not found
            if (!response.empty())
            {
                try
                {
                json errorJson = json::parse(response);
                if (errorJson.contains("error") && errorJson["error"].contains("code"))
                {
                    std::string errorCode = errorJson["error"]["code"];
                    if (errorCode == "download_not_found")
                    {
                        status = "not_found";
                        downloadedBytes = 0;
                        totalBytes = 0;
                        percentage = 0.0;
                        return true; // Return true to indicate we successfully determined there's no download
                    }
                }
            }
            catch (const std::exception &)
            {
                // If we can't parse the error response, fall through to return false
            }
            }
            return false;
        }
    }

    try
    {
        json progressJson = json::parse(response);

        status = progressJson.value("status", "unknown");

        if (progressJson.contains("progress"))
        {
            auto progress = progressJson["progress"];
            downloadedBytes = progress.value("downloaded_bytes", 0LL);
            totalBytes = progress.value("total_bytes", 0LL);
            percentage = progress.value("percentage", 0.0);
        }
        else
        {
            downloadedBytes = 0;
            totalBytes = 0;
            percentage = 0.0;
        }
        return true;
    }
    catch (const std::exception &)
    {
        return false;
    }
}

bool KolosalServerClient::monitorDownloadProgress(const std::string &modelId,
                                                  std::function<void(double, const std::string &, long long, long long)> progressCallback,
                                                  int checkIntervalMs)
{
    auto startTime = std::chrono::steady_clock::now();
    auto maxDuration = std::chrono::minutes(30); // 30 minute timeout
    
    // Variables to track 100% completion status
    auto lastHundredPercentTime = std::chrono::steady_clock::time_point{};
    auto hundredPercentTimeout = std::chrono::seconds(30); // 30 seconds timeout at 100%
    bool hasReachedHundred = false;

    while (true)
    {
        // Check for timeout
        if (std::chrono::steady_clock::now() - startTime > maxDuration) {
            return false;
        }
        
        long long downloadedBytes, totalBytes;
        double percentage;
        std::string status;

        if (!getDownloadProgress(modelId, downloadedBytes, totalBytes, percentage, status))
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(checkIntervalMs));
            continue;
        }

        progressCallback(percentage, status, downloadedBytes, totalBytes);

        // Success statuses
        if (status == "completed" || status == "creating_engine" || status == "engine_created")
        {
            return true;
        }
        // Failure statuses
        else if (status == "failed" || status == "cancelled" || status == "engine_creation_failed")
        {
            return false;
        }
        // No download found - this happens when a model file already exists and no download was needed
        else if (status == "not_found")
        {
            return true; // This is actually a success case - no download was needed
        }
        // Handle stuck at 100% case - download is complete but status hasn't transitioned yet
        else if (status == "downloading" && percentage >= 100.0)
        {
            if (!hasReachedHundred)
            {
                hasReachedHundred = true;
                lastHundredPercentTime = std::chrono::steady_clock::now();
                // Trigger status callback to show progress transition
                progressCallback(percentage, "completing", downloadedBytes, totalBytes);
            }
            else
            {
                auto timeSinceHundred = std::chrono::steady_clock::now() - lastHundredPercentTime;
                
                // Check if we've been stuck at 100% for a reasonable amount of time
                if (timeSinceHundred > hundredPercentTimeout)
                {
                    // First, check if the engine already exists (quick check)
                    if (engineExists(modelId))
                    {
                        // Engine exists, so download and engine creation was successful
                        progressCallback(100.0, "engine_created", downloadedBytes, totalBytes);
                        return true;
                    }
                    
                    // If more than 2 minutes at 100%, assume something is wrong
                    if (timeSinceHundred > std::chrono::minutes(2))
                    {
                        // Do one final check for engine existence before giving up
                        if (engineExists(modelId))
                        {
                            progressCallback(100.0, "engine_created", downloadedBytes, totalBytes);
                            return true;
                        }
                        return false; // Stuck too long, consider it failed
                    }
                    
                    // Between 30 seconds and 2 minutes, show "processing" status
                    if (timeSinceHundred > std::chrono::seconds(30))
                    {
                        progressCallback(percentage, "processing", downloadedBytes, totalBytes);
                    }
                }
            }
        }
        else
        {
            // Reset the 100% timer if we're not at 100%
            hasReachedHundred = false;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(checkIntervalMs));
    }
}

bool KolosalServerClient::makeGetRequest(const std::string &endpoint, std::string &response)
{
    std::string url = m_baseUrl + endpoint;

    std::vector<std::string> headers;
    if (!m_apiKey.empty())
    {
        headers.push_back("X-API-Key: " + m_apiKey);
    }

    HttpClient client;
    return client.get(url, response, headers);
}

bool KolosalServerClient::makePostRequest(const std::string &endpoint, const std::string &payload, std::string &response)
{
    std::string url = m_baseUrl + endpoint;

    std::vector<std::string> headers;
    headers.push_back("Content-Type: application/json");
    if (!m_apiKey.empty())
    {
        headers.push_back("X-API-Key: " + m_apiKey);
    }

    HttpClient client;
    return client.post(url, payload, response, headers);
}

bool KolosalServerClient::makeDeleteRequest(const std::string &endpoint, const std::string &payload, std::string &response)
{
    std::string url = m_baseUrl + endpoint;

    std::vector<std::string> headers;
    headers.push_back("Content-Type: application/json");
    if (!m_apiKey.empty())
    {
        headers.push_back("X-API-Key: " + m_apiKey);
    }

    HttpClient client;
    return client.deleteRequest(url, payload, response, headers);
}

bool KolosalServerClient::makePutRequest(const std::string &endpoint, const std::string &payload, std::string &response)
{
    std::string url = m_baseUrl + endpoint;

    std::vector<std::string> headers;
    headers.push_back("Content-Type: application/json");
    if (!m_apiKey.empty())
    {
        headers.push_back("X-API-Key: " + m_apiKey);
    }

    HttpClient client;
    return client.put(url, payload, response, headers);
}

bool KolosalServerClient::parseJsonValue(const std::string &jsonString, const std::string &key, std::string &value)
{
    try
    {
        json j = json::parse(jsonString);
        if (j.contains(key))
        {
            value = j[key].get<std::string>();
            return true;
        }
    }
    catch (const std::exception &)
    {
    }
    return false;
}

bool KolosalServerClient::parseJsonNumber(const std::string &jsonString, const std::string &key, double &value)
{
    try
    {
        json j = json::parse(jsonString);
        if (j.contains(key))
        {
            value = j[key].get<double>();
            return true;
        }
    }
    catch (const std::exception &)
    {
    }
    return false;
}

bool KolosalServerClient::shutdownServer()
{
    // Find the kolosal-server process
    ProcessId serverPid = findServerProcess();
    if (serverPid == 0) {
        // No server process found, consider it already stopped
        return true;
    }

    LoadingAnimation loading("Shutting down server");
    loading.start();

    // Terminate the process
    if (terminateProcess(serverPid)) {
        loading.complete("Server shutdown successfully");
        return true;
    } else {
        loading.stop();
        std::cerr << "Error: Failed to terminate server process" << std::endl;
        return false;
    }
}

bool KolosalServerClient::cancelDownload(const std::string &modelId)
{
    LoadingAnimation loading("Cancelling download");
    loading.start();

    std::string response;
    std::string endpoint = "/v1/downloads/" + modelId + "/cancel";

    // Try v1 endpoint first, then fallback to non-v1
    if (!makePostRequest(endpoint, "{}", response))
    {
        endpoint = "/downloads/" + modelId + "/cancel";
        if (!makePostRequest(endpoint, "{}", response))
        {
            loading.stop();
            return false;
        }
    }

    try
    {
        json cancelJson = json::parse(response);
        bool success = cancelJson.value("success", false);
        if (success) {
            loading.complete("Download cancelled");
            // Server handles config updates automatically now
        } else {
            loading.stop();
        }
        return success;
    }
    catch (const std::exception &)
    {
        loading.stop();
        return false;
    }
}

bool KolosalServerClient::cancelAllDownloads()
{
    LoadingAnimation loading("Cancelling all downloads");
    loading.start();

    std::string response;
    std::string endpoint = "/v1/downloads/cancel";

    // Try v1 endpoint first, then fallback to non-v1
    if (!makePostRequest(endpoint, "{}", response))
    {
        endpoint = "/downloads/cancel";
        if (!makePostRequest(endpoint, "{}", response))
        {
            loading.stop();
            return false;
        }
    }

    try
    {
        json cancelJson = json::parse(response);
        int cancelledCount = cancelJson.value("cancelled_count", 0);
        loading.complete("All downloads cancelled");
        return true;
    }
    catch (const std::exception &)
    {
        loading.stop();
        return false;
    }
}

bool KolosalServerClient::pauseDownload(const std::string &modelId)
{
    LoadingAnimation loading("Pausing download");
    loading.start();

    std::string response;
    std::string endpoint = "/v1/downloads/" + modelId + "/pause";

    // Try v1 endpoint first, then fallback to non-v1
    if (!makePostRequest(endpoint, "{}", response))
    {
        endpoint = "/downloads/" + modelId + "/pause";
        if (!makePostRequest(endpoint, "{}", response))
        {
            loading.stop();
            return false;
        }
    }

    try
    {
        json pauseJson = json::parse(response);
        bool success = pauseJson.value("success", false);
        if (success) {
            loading.complete("Download paused");
        } else {
            loading.stop();
        }
        return success;
    }
    catch (const std::exception &)
    {
        loading.stop();
        return false;
    }
}

bool KolosalServerClient::resumeDownload(const std::string &modelId)
{
    LoadingAnimation loading("Resuming download");
    loading.start();

    std::string response;
    std::string endpoint = "/v1/downloads/" + modelId + "/resume";

    // Try v1 endpoint first, then fallback to non-v1
    if (!makePostRequest(endpoint, "{}", response))
    {
        endpoint = "/downloads/" + modelId + "/resume";
        if (!makePostRequest(endpoint, "{}", response))
        {
            loading.stop();
            return false;
        }
    }

    try
    {
        json resumeJson = json::parse(response);
        bool success = resumeJson.value("success", false);
        if (success) {
            loading.complete("Download resumed");
        } else {
            loading.stop();
        }
        return success;
    }
    catch (const std::exception &)
    {
        loading.stop();
        return false;
    }
}

bool KolosalServerClient::getAllDownloads(std::vector<std::tuple<std::string, std::string, double, long long, long long>>& downloads)
{
    std::string response;
    std::string endpoint = "/v1/downloads";

    // Try v1 endpoint first, then fallback to non-v1
    if (!makeGetRequest(endpoint, response))
    {
        endpoint = "/downloads";
        if (!makeGetRequest(endpoint, response))
        {
            return false;
        }
    }

    try
    {
        json downloadsJson = json::parse(response);
        
        if (downloadsJson.contains("downloads") && downloadsJson["downloads"].is_array())
        {
            downloads.clear();
            for (const auto& download : downloadsJson["downloads"])
            {
                std::string modelId = download.value("model_id", "");
                std::string status = download.value("status", "");
                double percentage = download.value("percentage", 0.0);
                long long downloadedBytes = download.value("downloaded_bytes", 0LL);
                long long totalBytes = download.value("total_bytes", 0LL);
                
                downloads.emplace_back(modelId, status, percentage, downloadedBytes, totalBytes);
            }
            return true;
        }
        
        return false;
    }
    catch (const std::exception &)
    {
        return false;
    }
}



bool KolosalServerClient::chatCompletion(const std::string& engineId, const std::string& message, std::string& response)
{
    try {
        json requestBody = {
            {"model", engineId},
            {"messages", json::array({
                {{"role", "user"}, {"content", message}}
            })},
            {"streaming", false},
            {"maxNewTokens", 2048},
            {"temperature", 0.7},
            {"topP", 0.9}
        };

        std::string jsonResponse;
        if (!makePostRequest("/v1/inference/chat/completions", requestBody.dump(), jsonResponse)) {
            return false;
        }

        // Parse the response - using inference format
        json responseJson = json::parse(jsonResponse);
        if (responseJson.contains("text")) {
            response = responseJson["text"].get<std::string>();
            return true;
        }

        return false;
    } catch (const std::exception&) {
        return false;
    }
}

bool KolosalServerClient::streamingChatCompletion(const std::string& engineId, const std::string& message, 
                                                std::function<void(const std::string&, double, double)> responseCallback)
{
    try {
        json requestBody = {
            {"model", engineId},
            {"messages", json::array({
                {{"role", "user"}, {"content", message}}
            })},
            {"streaming", true},
            {"maxNewTokens", 2048},
            {"temperature", 0.7},
            {"topP", 0.9}
        };

        // For streaming, we need to make a custom HTTP request to handle Server-Sent Events
        std::string url = m_baseUrl + "/v1/inference/chat/completions";
        std::string headers = "Content-Type: application/json\r\n";
        headers += "Accept: text/event-stream\r\n";
        headers += "Cache-Control: no-cache\r\n";
        if (!m_apiKey.empty()) {
            headers += "Authorization: Bearer " + m_apiKey + "\r\n";
        }

        // Use a basic streaming implementation
        std::string buffer;
        bool receivedContent = false;
        bool streamComplete = false;
        bool httpSuccess = HttpClient::getInstance().makeStreamingRequest(url, requestBody.dump(), headers, 
            [&](const std::string& jsonData) {
                try {
                    json chunkJson = json::parse(jsonData);
                    
                    // Handle inference chat completion response format
                    if (chunkJson.contains("text")) {
                        std::string content = chunkJson["text"].get<std::string>();
                        double tps = chunkJson.value("tps", 0.0);
                        double ttft = chunkJson.value("ttft", 0.0);
                        
                        if (!content.empty()) {
                            responseCallback(content, tps, ttft);
                            receivedContent = true;
                        }
                    }
                    
                    // Check for completion - final chunk has partial=false
                    if (chunkJson.contains("partial") && !chunkJson["partial"].get<bool>()) {
                        streamComplete = true;
                    }
                    
                    // Check for error
                    if (chunkJson.contains("error")) {
                        streamComplete = true;
                    }
                } catch (const std::exception&) {
                    // Silently ignore JSON parse errors for malformed chunks
                }
            });

        // Consider streaming successful if we received any content or completed stream, regardless of HTTP status
        return receivedContent || streamComplete;
    } catch (const std::exception&) {
        return false;
    }
}

bool KolosalServerClient::streamingChatCompletionJson(const std::string& engineId, const std::string& message,
                                                    const std::string& jsonSchema,
                                                    std::function<void(const std::string&, double, double)> responseCallback)
{
    try {
        json requestBody = {
            {"model", engineId},
            {"messages", json::array({
                {{"role", "user"}, {"content", message}}
            })},
            {"streaming", true},
            {"maxNewTokens", 2048},
            {"temperature", 0.0}, // deterministic for JSON
            {"topP", 1.0}
        };

        // Attach JSON Schema using the new inference support
        // Prefer OpenAI-compatible response_format where possible
        requestBody["response_format"] = {
            {"type", "json_schema"},
            {"json_schema", {
                {"name", "schema"},
                {"schema", json::parse(jsonSchema, nullptr, false).is_discarded() ? json::object() : json::parse(jsonSchema)}
            }}
        };

        // Also include a raw jsonSchema field for direct inference route parsing
        // If the schema isn't valid JSON, pass it as string
        try {
            auto parsed = json::parse(jsonSchema);
            requestBody["jsonSchema"] = parsed;
        } catch (...) {
            requestBody["jsonSchema"] = jsonSchema;
        }

        std::string url = m_baseUrl + "/v1/inference/chat/completions";
        std::string headers = "Content-Type: application/json\r\n";
        headers += "Accept: text/event-stream\r\n";
        headers += "Cache-Control: no-cache\r\n";
        if (!m_apiKey.empty()) {
            headers += "Authorization: Bearer " + m_apiKey + "\r\n";
        }

        bool receivedContent = false;
        bool streamComplete = false;
        bool httpSuccess = HttpClient::getInstance().makeStreamingRequest(url, requestBody.dump(), headers,
            [&](const std::string& jsonData) {
                try {
                    json chunkJson = json::parse(jsonData);
                    if (chunkJson.contains("text")) {
                        std::string content = chunkJson["text"].get<std::string>();
                        double tps = chunkJson.value("tps", 0.0);
                        double ttft = chunkJson.value("ttft", 0.0);
                        if (!content.empty()) {
                            responseCallback(content, tps, ttft);
                            receivedContent = true;
                        }
                    }
                    if (chunkJson.contains("partial") && !chunkJson["partial"].get<bool>()) {
                        streamComplete = true;
                    }
                    if (chunkJson.contains("error")) {
                        streamComplete = true;
                    }
                } catch (const std::exception&) {
                    // ignore malformed chunks
                }
            });

        return receivedContent || streamComplete;
    } catch (const std::exception&) {
        return false;
    }
}

bool KolosalServerClient::getLogs(std::vector<std::tuple<std::string, std::string, std::string>>& logs) {
    try {
        std::string response;
        if (!makeGetRequest("/logs", response)) {
            return false;
        }
        
        json jsonResponse = json::parse(response);
        
        if (!jsonResponse.contains("logs") || !jsonResponse["logs"].is_array()) {
            return false;
        }
        
        logs.clear();
        for (const auto& logEntry : jsonResponse["logs"]) {
            if (logEntry.contains("level") && logEntry.contains("timestamp") && logEntry.contains("message")) {
                logs.emplace_back(
                    logEntry["level"].get<std::string>(),
                    logEntry["timestamp"].get<std::string>(),
                    logEntry["message"].get<std::string>()
                );
            }
        }
        
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

bool KolosalServerClient::getInferenceEngines(std::vector<std::tuple<std::string, std::string, std::string, std::string, bool>>& engines)
{
    std::string response;
    
    // Try both /v1/inference-engines and /inference-engines endpoints
    if (!makeGetRequest("/v1/engines", response))
    {
        if (!makeGetRequest("/engines", response))
        {
            return false;
        }
    }

    try
    {
        json enginesJson = json::parse(response);
        engines.clear();
        
        // Handle inference engines response format
        if (enginesJson.contains("inference_engines") && enginesJson["inference_engines"].is_array())
        {
            for (const auto& engine : enginesJson["inference_engines"])
            {
                std::string name = engine.value("name", "");
                std::string version = engine.value("version", "");
                std::string description = engine.value("description", "");
                std::string library_path = engine.value("library_path", "");
                bool is_loaded = engine.value("is_loaded", false);
                
                engines.emplace_back(name, version, description, library_path, is_loaded);
            }
        }
        
        return true;
    }
    catch (const std::exception&)
    {
        return false;
    }
}

bool KolosalServerClient::addInferenceEngine(const std::string& name, const std::string& libraryPath, bool loadOnStartup)
{
    try {
        // Prepare JSON payload for the POST request
        json payload;
        payload["name"] = name;
        payload["library_path"] = libraryPath;
        payload["load_on_startup"] = loadOnStartup;
        
        std::string requestBody = payload.dump();
        std::string response;
        
        // Try both /v1/engines and /engines endpoints
        if (!makePostRequest("/v1/engines", requestBody, response))
        {
            if (!makePostRequest("/engines", requestBody, response))
            {
                return false;
            }
        }
        
        // Parse the response to check if addition was successful
        json responseJson = json::parse(response);
        
        // Check if the response indicates success
        if (responseJson.contains("status") && responseJson["status"] == "success")
        {
            return true;
        }
        
        // Also accept if we get a success message
        if (responseJson.contains("message"))
        {
            std::string message = responseJson["message"];
            return message.find("successfully") != std::string::npos ||
                   message.find("added") != std::string::npos;
        }
        
        return false;
    }
    catch (const std::exception&)
    {
        return false;
    }
}

bool KolosalServerClient::removeModel(const std::string& modelId)
{
    try {
        std::string response;
        // Use DELETE request to the RESTful endpoint /models/{id}
        std::string endpoint = "/models/" + modelId;
        if (!makeDeleteRequest(endpoint, "", response)) {
            return false;
        }

        // Parse the response to check if removal was successful
        json responseJson = json::parse(response);
        return responseJson.contains("status") && responseJson["status"] == "removed";
    }
    catch (const std::exception&) {
        return false;
    }
}

bool KolosalServerClient::getModelStatus(const std::string& modelId, std::string& status, std::string& message)
{
    try {
        std::string response;
        // Use GET request to the RESTful status endpoint /models/{id}/status
        std::string endpoint = "/models/" + modelId + "/status";
        if (!makeGetRequest(endpoint, response)) {
            return false;
        }

        // Parse the response
        json responseJson = json::parse(response);
        status = responseJson.value("status", "unknown");
        message = responseJson.value("message", "");
        return true;
    }
    catch (const std::exception&) {
        return false;
    }
}

bool KolosalServerClient::setDefaultInferenceEngine(const std::string& engineName)
{
    try {
        // Prepare JSON payload for the PUT request
        json payload;
        payload["engine_name"] = engineName;
        
        std::string requestBody = payload.dump();
        std::string response;
        
        // Try both /v1/engines and /engines endpoints
        if (!makePutRequest("/v1/engines", requestBody, response))
        {
            if (!makePutRequest("/engines", requestBody, response))
            {
                return false;
            }
        }
        
        // Parse the response to check if setting was successful
        json responseJson = json::parse(response);
        
        // Check if the response indicates success
        if (responseJson.contains("message"))
        {
            std::string message = responseJson["message"];
            return message.find("successfully") != std::string::npos ||
                   message.find("set") != std::string::npos;
        }
        
        return false;
    }
    catch (const std::exception&)
    {
        return false;
    }
}

bool KolosalServerClient::getDefaultInferenceEngine(std::string& defaultEngine)
{
    std::string response;
    
    // Try both /v1/engines and /engines endpoints
    if (!makeGetRequest("/v1/engines", response))
    {
        if (!makeGetRequest("/engines", response))
        {
            return false;
        }
    }

    try
    {
        json enginesJson = json::parse(response);
        
        // Extract the default engine from the response
        if (enginesJson.contains("default_engine"))
        {
            defaultEngine = enginesJson["default_engine"].get<std::string>();
            return true;
        }
        
        return false;
    }
    catch (const std::exception&)
    {
        return false;
    }
}


