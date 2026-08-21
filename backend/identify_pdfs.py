import glob
import pdfplumber

pdf_files = glob.glob('/home/abhay/.gemini/antigravity/brain/db7ad472-2fc7-427f-9b0d-ee33bc69c697/.user_uploaded/*.pdf')

for f in pdf_files:
    try:
        with pdfplumber.open(f) as pdf:
            if pdf.pages:
                text = pdf.pages[0].extract_text()
                print(f"File: {f.split('/')[-1]}")
                print(text[:200].replace('\n', ' '))
                print('-' * 40)
    except Exception as e:
        print(f"File: {f.split('/')[-1]} - ERROR: {e}")
