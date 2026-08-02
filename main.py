import webview
import os

# 1. Define your Python backend logic
class Api:
    def process_data(self, value):
        # This is where your Python/C++ heavy lifting goes
        return f"Python processed: {value.upper()}"

# 2. Create an instance of your API
api = Api()

# 3. Get the absolute path to your HTML file
#    This is more reliable than a relative path.
file_path = 'file://' + os.path.abspath('ui/index.html')

# 4. Create the window and pass the API
window = webview.create_window(
    'My Modern App',       # Window title
    file_path,             # URL or HTML file
    js_api=api,            # Expose Python methods to JS
    width=1024,
    height=768
)

# 5. Start the application
webview.start()