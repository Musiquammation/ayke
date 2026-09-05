import re
import os

def get_div_block(html_content, div_id="main"):
    """
    Finds the exact start and end string indices of a div block by counting nested tags.
    Returns: (start_index, end_index, extracted_html_string)
    """
    # Find the starting tag of the div with the specific ID
    start_match = re.search(rf'<div[^>]*id=["\']{div_id}["\'][^>]*>', html_content, re.IGNORECASE)
    
    if not start_match:
        return None, None, None

    start_idx = start_match.start()
    
    # Regex to find any opening or closing div tags
    tag_pattern = re.compile(r'<\s*(/?)\s*div(?:[^>]*)>', re.IGNORECASE)
    
    depth = 0
    # Iterate through all div tags starting from our target div
    for match in tag_pattern.finditer(html_content, start_idx):
        is_closing_tag = match.group(1) == '/'
        
        if is_closing_tag:
            depth -= 1
        else:
            depth += 1
            
        # When depth returns to 0, we have found our matching closing tag
        if depth == 0:
            end_idx = match.end()
            return start_idx, end_idx, html_content[start_idx:end_idx]
            
    return None, None, None

def copy_main_div(source_file, dest_file):
    if not os.path.exists(source_file) or not os.path.exists(dest_file):
        print("Error: Source or destination file not found.")
        return

    # Read the files exactly as they are
    with open(source_file, 'r', encoding='utf-8') as f:
        source_html = f.read()

    with open(dest_file, 'r', encoding='utf-8') as f:
        dest_html = f.read()

    # Extract the exact block from the source
    _, _, source_block = get_div_block(source_html, "main")
    if not source_block:
        print(f"Error: Could not find <div id='main'> in {source_file}")
        return

    # Find the boundaries of the block in the destination
    dest_start, dest_end, _ = get_div_block(dest_html, "main")
    if dest_start is None:
        print(f"Error: Could not find <div id='main'> in {dest_file}")
        return

    # Splice the new block into the original destination string
    updated_dest_html = dest_html[:dest_start] + source_block + dest_html[dest_end:]

    # Write the result back to the destination file
    with open(dest_file, 'w', encoding='utf-8') as f:
        f.write(updated_dest_html)

    print(f"Successfully copied <div id='main'> while preserving all original tabs and formatting!")

if __name__ == "__main__":
    SOURCE = "dist/index.html"
    DEST = "index.html"
    
    copy_main_div(SOURCE, DEST)