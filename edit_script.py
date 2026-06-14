import sys

with open('./src/pages/StockScreeningPage.jsx', 'r') as f:
    content = f.read()

with open('./top_bar_div_raw.txt', 'r') as f:
    top_bar_div = f.read()

with open('./filters_div_indented.txt', 'r') as f:
    filters_div = f.read()

# Remove the top bar div
content = content.replace(top_bar_div, '')

# Now, insert the filters div after the Run Screening button
button_string = '''          <button
            type="button"
            onClick={() => setDateModalOpen(true)}
            className="mt-10 inline-flex items-center gap-2.5 rounded-xl bg-brand px-8 py-4 text-base font-medium text-white shadow-lg shadow-brand/20 transition-all duration-200 hover:bg-brand-deep hover:shadow-xl hover:shadow-brand/25 active:scale-[0.98]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
            </svg>
            Run Screening
          </button>'''

# We want to insert the filters div after this button string
new_content = content.replace(button_string, button_string + '\n\n' + filters_div)

with open('./src/pages/StockScreeningPage.jsx', 'w') as f:
    f.write(new_content)