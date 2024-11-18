from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pyautogui
import time
from selenium.webdriver.chrome.options import Options

# Chrome-Optionen konfigurieren
chrome_options = Options()
chrome_options.add_argument('--disable-blink-features=AutomationControlled')
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
chrome_options.add_experimental_option('useAutomationExtension', False)

# Browser-Instanz mit Optionen erstellen
driver = webdriver.Chrome(options=chrome_options)

try:
    # Zur localhost Seite navigieren
    driver.get("http://localhost:8000")
    
    # Warten bis der Button gefunden wird und klickbar ist (maximal 10 Sekunden)
    button = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.ID , "home-features"))
    )
    
    # Position des Buttons ermitteln
    button_rect = button.rect
    
    # Fensterposition berücksichtigen
    window_pos = driver.get_window_position()
    window_size = driver.get_window_size()
    
    # Absolute Bildschirmposition berechnen
    target_x = window_pos['x'] + button_rect['x'] + button_rect['width']/2
    target_y = window_pos['y'] + button_rect['y'] + button_rect['height']/2 + 80  # 80px für die Chrome Toolbar
    
    # Langsam zur Zielposition bewegen
    pyautogui.moveTo(target_x, target_y, duration=1)
    time.sleep(0.5)
    
    # Button klicken
    pyautogui.click()
    
finally:
    # Browser schließen
    driver.quit()
