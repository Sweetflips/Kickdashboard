@echo off
echo Starting ngrok tunnel for localhost:3000...
echo.
echo Once ngrok starts, you'll see a URL like: https://abc123.ngrok.io
echo Copy that URL and paste it in the webhook input field in your app.
echo.
echo Press Ctrl+C to stop ngrok when you're done.
echo.
ngrok http 3000
if errorlevel 1 (
    echo.
    echo ERROR: ngrok failed to start. Make sure ngrok is installed and in your PATH.
    pause
)
