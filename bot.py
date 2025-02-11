from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pyautogui
import time
import random
from selenium.webdriver.chrome.options import Options
import math

# Chrome-Optionen konfigurieren
chrome_options = Options()
chrome_options.add_argument('--disable-blink-features=AutomationControlled')
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
chrome_options.add_experimental_option('useAutomationExtension', False)
# full-screen
chrome_options.add_argument("--start-maximized")
chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

# Browser-Instanz mit Optionen erstellen
driver = webdriver.Chrome(options=chrome_options)

def linear_path(current, target, steps=20, duration=0.05):
    # Bewegt den Cursor direkt linear zum Ziel
    for i in range(1, steps + 1):
        t = i / steps
        x = current[0] + (target[0] - current[0]) * t
        y = current[1] + (target[1] - current[1]) * t
        pyautogui.moveTo(x, y, duration=duration)

def zigzag_path(current, target, steps=20, duration=0.05):
    # Erzeugt einen zufälligen Zwischenpunkt und bewegt sich dann in zwei linearen Schritten
    mid_x = (current[0] + target[0]) / 2 + random.uniform(-50, 50)
    mid_y = (current[1] + target[1]) / 2 + random.uniform(-50, 50)
    # Von current zum Zwischenpunkt
    for i in range(1, steps // 2 + 1):
        t = i / (steps / 2)
        x = current[0] + (mid_x - current[0]) * t
        y = current[1] + (mid_y - current[1]) * t
        pyautogui.moveTo(x, y, duration=duration)
    # Vom Zwischenpunkt zum Ziel
    for i in range(1, steps // 2 + 1):
        t = i / (steps / 2)
        x = mid_x + (target[0] - mid_x) * t
        y = mid_y + (target[1] - mid_y) * t
        pyautogui.moveTo(x, y, duration=duration)

def human_time_linear_path(current, target, steps=20, total_duration=2.0):
    # Bewegt den Cursor linear, wobei die Zeit zwischen den Schritten konstant ist
    interval = total_duration / steps
    for i in range(1, steps + 1):
        t = i / steps
        x = current[0] + (target[0] - current[0]) * t
        y = current[1] + (target[1] - current[1]) * t
        pyautogui.moveTo(x, y, duration=interval)

try:
    # Zufällige Wartezeit vor dem Start
    # time.sleep(random.uniform(1, 3))
    
    # Zur localhost Seite navigieren
    driver.get("http://localhost:8000")

    # Neue Schleife, die 100-mal ausgeführt wird:
    for _ in range(4):
        # Zufällige Position auf dem Bildschirm anfahren
        screenWidth, screenHeight = pyautogui.size()
        
        # Ziel-Element ermitteln (z.B. "home-features")
        target_elem = driver.find_element(By.ID, "home-features")
        rect = target_elem.rect
        window_pos = driver.get_window_position()
        target_x = window_pos['x'] + rect['x'] + rect['width'] / 2 
        target_y = window_pos['y'] + rect['y'] + rect['height'] / 2 + 80  # 80px für die Chrome Toolbar
        current_pos = pyautogui.position()
        
        # Zufällig eine der drei Bewegungsfunktionen auswählen
        path_func = random.choice([linear_path, zigzag_path, human_time_linear_path])
        if path_func == human_time_linear_path:
            path_func(current_pos, (target_x, target_y), steps=20, total_duration=2.0)
        else:
            path_func(current_pos, (target_x, target_y), steps=20, duration=0.05)
        
        pyautogui.click()  # Auf das Element klicken
        time.sleep(0.1)
        # scroll ganz nach oben
        driver.execute_script("window.scrollTo(0, 0)")
        random_x = random.randint(0, screenWidth)
        random_y = random.randint(0, screenHeight)
        pyautogui.moveTo(random_x, random_y, duration=0.5)
        pyautogui.click()
    
finally:
    # Browser schließen
    driver.quit()