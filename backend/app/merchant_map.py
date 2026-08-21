import re
from typing import Tuple, Optional

# Regex pattern mapping for common Indian merchants and platforms
MERCHANT_RULES = [
    # Food Delivery & Quick Commerce
    (r"SWIGGY\s*INSTAMART", "Swiggy Instamart", "Groceries", "Quick Commerce"),
    (r"SWIGGY", "Swiggy", "Dining", "Food Delivery"),
    (r"ZOMATO", "Zomato", "Dining", "Food Delivery"),
    (r"BLINKIT|GROFERS", "Blinkit", "Groceries", "Quick Commerce"),
    (r"ZEPTO", "Zepto", "Groceries", "Quick Commerce"),
    (r"BIGBASKET|BB\s*DAILY", "BigBasket", "Groceries", "Online Grocery"),
    (r"DUNZO", "Dunzo", "Groceries", "Quick Commerce"),
    (r"EATCLUB|BOX8|MOJO\s*PIZZA", "EatClub", "Dining", "Cloud Kitchen"),
    (r"DOMINOS|JUBILANT\s*FOODWORKS", "Domino's Pizza", "Dining", "Restaurant"),
    (r"MCDONALDS|HARDCASTLE", "McDonald's", "Dining", "Fast Food"),
    (r"STARBUCKS|TATA\s*STARBUCKS", "Starbucks", "Dining", "Cafe"),
    (r"CHAAYOS|CHAI\s*POINT", "Chaayos", "Dining", "Cafe"),

    # E-Commerce & Retail
    (r"AMAZON\s*PAY|AMZN", "Amazon", "Shopping", "E-Commerce"),
    (r"FLIPKART", "Flipkart", "Shopping", "E-Commerce"),
    (r"MYNTRA", "Myntra", "Shopping", "Apparel"),
    (r"MEESHO", "Meesho", "Shopping", "E-Commerce"),
    (r"AJIO", "Ajio", "Shopping", "Apparel"),
    (r"NYKAA", "Nykaa", "Shopping", "Beauty & Personal"),
    (r"TATA\s*CLIQ|TATA\s*1MG|1MG", "Tata 1mg", "Healthcare", "Pharmacy"),
    (r"APOLLO\s*PHARMACY", "Apollo Pharmacy", "Healthcare", "Pharmacy"),
    (r"NETMEDS|PHARMEASY", "PharmEasy", "Healthcare", "Pharmacy"),
    (r"CROWD\s*FURNITURE|IKEA", "IKEA", "Shopping", "Home Decor"),
    (r"DECATHLON", "Decathlon", "Shopping", "Sports & Outdoors"),

    # Travel, Transit & Fuel
    (r"IRCTC|INDIAN\s*RAILWAY", "IRCTC", "Travel", "Train Tickets"),
    (r"MAKEMYTRIP|MMT", "MakeMyTrip", "Travel", "Online Travel Agency"),
    (r"GOIBIBO", "Goibibo", "Travel", "Online Travel Agency"),
    (r"EASEMYTRIP", "EaseMyTrip", "Travel", "Flight Tickets"),
    (r"INDIGO|INTERGLOBE", "IndiGo Airlines", "Travel", "Airlines"),
    (r"AIR\s*INDIA", "Air India", "Travel", "Airlines"),
    (r"VISTARA|TATA\s*SIA", "Vistara", "Travel", "Airlines"),
    (r"UBER", "Uber", "Travel", "Cab / Ride Hailing"),
    (r"OLA\s*CABS|ANI\s*TECHNOLOGIES", "Ola", "Travel", "Cab / Ride Hailing"),
    (r"RAPIDO|ROPPEN", "Rapido", "Travel", "Bike Taxi / Auto"),
    (r"BLUSMART|BLU\s*SMART", "BluSmart", "Travel", "EV Cab"),
    (r"HPCL|HINDUSTAN\s*PETROLEUM", "HPCL Fuel", "Fuel", "Petrol Pump"),
    (r"BPCL|BHARAT\s*PETROLEUM", "BPCL Fuel", "Fuel", "Petrol Pump"),
    (r"IOCL|INDIAN\s*OIL", "Indian Oil Fuel", "Fuel", "Petrol Pump"),
    (r"SHELL\s*INDIA", "Shell Fuel", "Fuel", "Petrol Pump"),
    (r"METRO\s*RAIL|DMRC|BMRCL|MAHAMETRO", "Metro Rail", "Travel", "Public Transit"),
    (r"FASTAG|IHMCL|NETC", "FASTag Toll", "Travel", "Toll Charges"),

    # Subscriptions & Digital Services
    (r"NETFLIX", "Netflix", "Entertainment", "OTT Subscription"),
    (r"HOTSTAR|DISNEY", "Disney+ Hotstar", "Entertainment", "OTT Subscription"),
    (r"PRIME\s*VIDEO", "Prime Video", "Entertainment", "OTT Subscription"),
    (r"SPOTIFY", "Spotify", "Entertainment", "Music Streaming"),
    (r"YOUTUBE\s*PREMIUM|GOOGLE\s*YOUTUBE", "YouTube Premium", "Entertainment", "Subscription"),
    (r"APPLE\.COM|ITUNES", "Apple Services", "Entertainment", "Digital Services"),
    (r"GOOGLE\s*PLAY|GOOGLE\s*STORAGE|GOOGLE\s*CLOUD", "Google Services", "Utilities", "Cloud / App Store"),
    (r"OPENAI|CHATGPT", "OpenAI / ChatGPT", "Utilities", "AI Subscription"),
    (r"GITHUB", "GitHub", "Utilities", "Software"),
    (r"SONY\s*LIV", "Sony LIV", "Entertainment", "OTT Subscription"),
    (r"ZEE5", "ZEE5", "Entertainment", "OTT Subscription"),
    (r"BOOKMYSHOW|BIGTREE", "BookMyShow", "Entertainment", "Movies & Events"),

    # Utilities, Telecom & Bill Payments
    (r"AIRTEL", "Airtel", "Utilities", "Mobile / Broadband"),
    (r"JIO|RELIANCE\s*JIO", "Jio", "Utilities", "Mobile / Fiber"),
    (r"VODAFONE|VI\s*PREPAID|VI\s*POSTPAID", "Vodafone Idea (Vi)", "Utilities", "Mobile"),
    (r"TATA\s*POWER|BESCOM|MSEDCL|TSSPDCL|UPPCL|BSES", "Electricity Bill", "Utilities", "Power"),
    (r"IGL|MAHANAGAR\s*GAS|ADANI\s*TOTAL\s*GAS|INDANE|HP\s*GAS|BHARAT\s*GAS", "Gas Utility", "Utilities", "Cooking Gas"),
    (r"CRED\s*CLUB|CRED", "CRED", "Utilities", "Credit Card Payment"),
    (r"BILLDESK", "BillDesk", "Utilities", "Bill Payment"),
    (r"BBPS", "BBPS Bill Pay", "Utilities", "Bill Payment"),

    # Investments, Trading & Insurance
    (r"ZERODHA", "Zerodha", "Investment", "Stock Brokerage"),
    (r"GROWW|NEXTBILLION", "Groww", "Investment", "Mutual Funds / Stocks"),
    (r"ANGEL\s*ONE|ANGEL\s*BROKING", "Angel One", "Investment", "Stock Brokerage"),
    (r"UPSTOX|RKSV", "Upstox", "Investment", "Stock Brokerage"),
    (r"INDMONEY", "INDmoney", "Investment", "Wealth Management"),
    (r"KFINTECH|CAMS", "Mutual Fund Registrar (CAMS/KFIN)", "Investment", "Mutual Funds"),
    (r"LIC\s*OF\s*INDIA|LIFE\s*INSURANCE", "LIC of India", "Investment", "Life Insurance"),
    (r"HDFC\s*LIFE", "HDFC Life", "Investment", "Insurance"),
    (r"ICICI\s*PRU", "ICICI Prudential", "Investment", "Insurance"),
    (r"SBI\s*LIFE", "SBI Life", "Investment", "Insurance"),
    (r"STAR\s*HEALTH|NIVA\s*BUPA|CARE\s*HEALTH", "Health Insurance", "Healthcare", "Health Insurance"),

    # Bank fees, Interest & Salary
    (r"SALARY|MONTHLY\s*CREDIT|PAYROLL", "Salary / Payroll", "Salary/Income", "Employment Income"),
    (r"INTEREST\s*CREDIT|INT\.PD", "Bank Interest Credit", "Salary/Income", "Savings Interest"),
    (r"DIVIDEND", "Dividend Credit", "Salary/Income", "Investments"),
    (r"ANNUAL\s*MAINTENANCE|ANNUAL\s*FEE", "Annual Maintenance Charge", "Others", "Bank Fee"),
    (r"GST|IGST|CGST|SGST", "GST Tax", "Others", "Tax / Bank Fee"),
    (r"IMPS\s*CHARGES?|NEFT\s*CHARGES?", "Transfer Charges", "Others", "Bank Fee"),
    (r"SMS\s*ALERT\s*CHARGES?", "SMS Alert Charges", "Others", "Bank Fee"),
    (r"ATM\s*WITHDRAWAL|CASH\s*WDL", "Cash Withdrawal", "Others", "ATM Cash")
]

COMPILED_RULES = [
    (re.compile(pattern, re.IGNORECASE), name, cat, subcat)
    for pattern, name, cat, subcat in MERCHANT_RULES
]


def match_known_merchant(raw_text: str) -> Optional[Tuple[str, str, str]]:
    """
    Checks if raw description matches a known Indian merchant pattern.
    Returns (cleaned_merchant_name, category, subcategory) if found, else None.
    """
    if not raw_text:
        return None
    for compiled, name, cat, subcat in COMPILED_RULES:
        if compiled.search(raw_text):
            return name, cat, subcat
    return None
