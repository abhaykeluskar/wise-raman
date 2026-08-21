import pypdfium2

pdf_path = "/app/sample_pdfs/media_1787046795248.pdf"
pdf = pypdfium2.PdfDocument(pdf_path)
page = pdf[0]
image = page.render(scale=2).to_pil()
image.save("/app/sample_pdfs/axis_rendered.png")
print("Rendered page 1 to /app/sample_pdfs/axis_rendered.png successfully (size:", image.size, ")")
