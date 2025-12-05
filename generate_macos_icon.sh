#!/bin/bash

# Stop on any error and on unset variables or pipe failures
set -euo pipefail
# set -x # DEBUG: Print executed commands (Uncomment to debug, will be verbose)

# --- Configuration ---
INPUT_PNG_DEFAULT="base_icon.png"
INPUT_PNG="${1:-$INPUT_PNG_DEFAULT}"
OUTPUT_ICONSET_DIR="icon.iconset"
FINAL_ICNS_FILE="icon.icns"
CORNER_RADIUS_PERCENT=0.224
# Reduce the drawn icon size on the canvas by this percentage (Apple "safe area")
# e.g. 22.37 means the visible icon will occupy ~77.63% of the canvas
PADDING_PERCENT=15
# Toggle glossy highlight overlay (white-to-transparent gradient).
# Disable by default while we track down the grey-halo artefact.
ENABLE_GLOSS=true
# If you still see a grey fringe, enabling this will erode the alpha mask by
# 1 pixel after all compositing is done, removing half-transparent edge pixels.
# NOTE: This trade-off slightly reduces the visible radius by ~1 px.
ENABLE_EDGE_ERODE=true
DEBUG_STEP=false

# --- Check Dependencies ---
command -v magick >/dev/null 2>&1 || { echo >&2 "Error: ImageMagick (magick command) not found. Please install it (e.g., 'brew install imagemagick')."; exit 1; }
command -v iconutil >/dev/null 2>&1 || { echo >&2 "Error: iconutil (macOS specific) not found. This script requires macOS to create .icns files."; exit 1; }
command -v bc >/dev/null 2>&1 || { echo >&2 "Error: bc (basic calculator) not found. Please install it."; exit 1; }
command -v sips >/dev/null 2>&1 || { echo >&2 "Error: sips (macOS specific) not found. This script needs sips for verification."; exit 1; }

# --- Validate Input ---
if [ ! -f "$INPUT_PNG" ]; then
    echo >&2 "Error: Input PNG file not found at '$INPUT_PNG'"
    exit 1
fi
echo "Using input image: $INPUT_PNG"

# --- Setup Output Directory ---
if [ -d "$OUTPUT_ICONSET_DIR" ]; then
    echo "Clearing existing output directory: $OUTPUT_ICONSET_DIR"
    rm -rf "$OUTPUT_ICONSET_DIR"
fi
mkdir -p "$OUTPUT_ICONSET_DIR"
echo "Created output directory: $OUTPUT_ICONSET_DIR"

# --- Icon Sizes and Names ---
declare -a SIZES=(16 32  32 64  128 256  256 512  512 1024)
declare -a NAMES=(
    "icon_16x16.png" "icon_16x16@2x.png" "icon_32x32.png" "icon_32x32@2x.png"
    "icon_128x128.png" "icon_128x128@2x.png" "icon_256x256.png" "icon_256x256@2x.png"
    "icon_512x512.png" "icon_512x512@2x.png"
)

# --- Temporary File Management ---
TEMP_FILES_TO_CLEAN=()
function cleanup_temp_files {
    if [ ${#TEMP_FILES_TO_CLEAN[@]} -gt 0 ]; then
        echo "Cleaning up temporary files..."
        for tmp_file in "${TEMP_FILES_TO_CLEAN[@]}"; do
            rm -f "$tmp_file"
        done
    fi
}
trap cleanup_temp_files EXIT SIGINT SIGTERM

# --- Main Processing Loop ---
echo "Generating PNGs for .iconset..."
for i in "${!SIZES[@]}"; do
    SIZE=${SIZES[$i]}
    FILENAME=${NAMES[$i]}
    OUTPUT_PNG_PATH="$OUTPUT_ICONSET_DIR/$FILENAME"

    # --- Calculate scaled (visible) icon size & margin ---
    SCALE_FACTOR=$(echo "100 - $PADDING_PERCENT" | bc -l)  # e.g. 77.63
    SCALED_SIZE=$(printf "%.0f" "$(echo "$SIZE * $SCALE_FACTOR / 100" | bc -l)")
    MARGIN=$(( (SIZE - SCALED_SIZE) / 2 ))

    RADIUS_PX=$(printf "%.0f" "$(echo "$SCALED_SIZE * $CORNER_RADIUS_PERCENT" | bc -l)")
    if [ "$RADIUS_PX" -lt 1 ]; then RADIUS_PX=1; fi
    HALF_SCALED=$((SCALED_SIZE / 2))
    if [ "$RADIUS_PX" -gt "$HALF_SCALED" ]; then RADIUS_PX=$HALF_SCALED; fi

    # Define all temporary files for this iteration
    TEMP_RESIZED="temp_resized_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_RESIZED")
    TEMP_ROUNDED_MASK="mask_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_ROUNDED_MASK")
    TEMP_GRADIENT_LAYER="temp_gradient_layer_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_GRADIENT_LAYER") # DEFINITION ADDED/CORRECTED
    TEMP_SQUARE_WITH_GLOSS="temp_square_gloss_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_SQUARE_WITH_GLOSS")
    TEMP_SQUARE_WITH_INNER_SHADOW="temp_square_inner_shadow_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_SQUARE_WITH_INNER_SHADOW")
    
    TEMP_EDGE_MASK="temp_edge_mask_${SIZE}_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_EDGE_MASK")
    TEMP_INNER_SHADOW_PART1="temp_inner_shadow_part1_${SIZE}_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_INNER_SHADOW_PART1")
    TEMP_INNER_SHADOW_LAYER="temp_inner_shadow_layer_${SIZE}_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_INNER_SHADOW_LAYER")
    
    TEMP_ROUNDED_FINAL_ICON="temp_rounded_final_icon_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_ROUNDED_FINAL_ICON")
    TEMP_ALPHA_MASK_FOR_SHADOW="temp_alpha_mask_shadow_${SIZE}_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_ALPHA_MASK_FOR_SHADOW")
    TEMP_SHADOW_ONLY="temp_shadow_only_${SIZE}_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_SHADOW_ONLY")

    # Step 1: Resize input to the scaled icon size
    magick "$INPUT_PNG" -filter LanczosSharp -resize "${SCALED_SIZE}x${SCALED_SIZE}!" "PNG32:$TEMP_RESIZED"
    
    # Step 2: Create the Rounded Corner Masks (small for processing, large for final clipping)
    SCALED_MINUS_1=$((SCALED_SIZE - 1))
    magick -size "${SCALED_SIZE}x${SCALED_SIZE}" xc:none -fill white \
        -draw "roundrectangle 0,0,${SCALED_MINUS_1},${SCALED_MINUS_1},${RADIUS_PX},${RADIUS_PX}" \
        "PNG32:$TEMP_ROUNDED_MASK"

    TEMP_ROUNDED_MASK_CANVAS="mask_canvas_${SIZE}_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_ROUNDED_MASK_CANVAS")
    magick -size "${SIZE}x${SIZE}" xc:none "$TEMP_ROUNDED_MASK" -gravity center -compose Over -composite "PNG32:$TEMP_ROUNDED_MASK_CANVAS"

    # Step 3: Glossy highlight (optional)
    if [ "$ENABLE_GLOSS" = true ]; then
        GLOSS_HEIGHT=$(printf "%.0f" "$(echo "$SCALED_SIZE * 0.40" | bc -l)")
        GLOSS_OPACITY_START="0.15"
        # Part 3a: Generate the gradient layer
        magick -size "${SCALED_SIZE}x${GLOSS_HEIGHT}" \
               gradient:"rgba(255,255,255,${GLOSS_OPACITY_START})"-"rgba(255,255,255,0.0)" \
               -gravity North -background None -extent "${SCALED_SIZE}x${SCALED_SIZE}" \
               "PNG32:$TEMP_GRADIENT_LAYER"
        # Part 3b: Composite the gradient layer onto the resized (still square) image
        magick "$TEMP_RESIZED" "$TEMP_GRADIENT_LAYER" \
               -compose Over -composite "PNG32:$TEMP_SQUARE_WITH_GLOSS"
    else
        # Skip gloss – just carry the resized artwork forward.
        cp "$TEMP_RESIZED" "$TEMP_SQUARE_WITH_GLOSS"
    fi
        
    # Step 4: Inner Shadow - applied to the square image with gloss
    INNER_SHADOW_COLOR="rgba(0,0,0,0.20)"
    INNER_SHADOW_BLUR="0x0.75"
    # Create inner shadow based on the rounded mask, then composite onto the square glossed image
    magick "$TEMP_ROUNDED_MASK" \
           -morphology EdgeIn Diamond:1 \
           -fill "$INNER_SHADOW_COLOR" -opaque white \
           -fill transparent -opaque black \
           -blur "$INNER_SHADOW_BLUR" \
           "$TEMP_INNER_SHADOW_LAYER" # Output is the shaped, colored, blurred inner shadow layer
    
    magick "$TEMP_SQUARE_WITH_GLOSS" "$TEMP_INNER_SHADOW_LAYER" \
           -compose Atop -composite "PNG32:$TEMP_SQUARE_WITH_INNER_SHADOW"

    # Step 5: Final Rounding and Drop Shadow
    # First, apply the rounded corners to the fully styled square image using DstIn to pre-multiply and eliminate halo
    magick "$TEMP_SQUARE_WITH_INNER_SHADOW" "$TEMP_ROUNDED_MASK" \
        -compose DstIn -composite "PNG32:$TEMP_ROUNDED_FINAL_ICON"

    if [ "$SIZE" -ge 128 ]; then
        SHADOW_OPACITY=35
        current_shadow_params=""
        if [ "$SIZE" -ge 512 ]; then current_shadow_params="${SHADOW_OPACITY}x5+3+4";
        elif [ "$SIZE" -ge 256 ]; then current_shadow_params="${SHADOW_OPACITY}x4+2+3";
        else current_shadow_params="${SHADOW_OPACITY}x3+2+2"; fi
        
        # Part 5a: Extract alpha from the *now rounded* final icon for shadow casting
        magick "$TEMP_ROUNDED_FINAL_ICON" \
            -alpha extract \
            "$TEMP_ALPHA_MASK_FOR_SHADOW"

        # Part 5b: Generate shadow from the rounded alpha mask
        magick "$TEMP_ALPHA_MASK_FOR_SHADOW" \
            -virtual-pixel transparent \
            -background black \
            -shadow "$current_shadow_params" \
            +repage \
            "$TEMP_SHADOW_ONLY"

        # Part 5c: Composite Shadow and the rounded icon
        magick -size "${SIZE}x${SIZE}" xc:none \
               "$TEMP_ROUNDED_FINAL_ICON" -gravity center -compose Over -composite \
               "$TEMP_SHADOW_ONLY" -gravity center -compose DstOver -composite \
               "PNG32:$OUTPUT_PNG_PATH"

        # Part 5d: Re-apply the rounded mask so that any shadow pixels that were
        # laid down outside of the rounded rectangle (especially in the corner
        # areas) are clipped out, preventing the appearance of sharp, semi-
        # transparent corners while preserving the shadow elsewhere.
        magick "$OUTPUT_PNG_PATH" "$TEMP_ROUNDED_MASK_CANVAS" \
               -compose DstIn -composite \
               "PNG32:$OUTPUT_PNG_PATH"
    else
        # For smaller sizes, center the rounded icon on a transparent canvas of full size
        magick -size "${SIZE}x${SIZE}" xc:none "$TEMP_ROUNDED_FINAL_ICON" -gravity center -compose Over -composite "PNG32:$OUTPUT_PNG_PATH"
        # Apply the larger mask (DstIn) to pre-multiply and ensure transparency in the corner padding areas
        magick "$OUTPUT_PNG_PATH" "$TEMP_ROUNDED_MASK_CANVAS" -compose DstIn -composite "PNG32:$OUTPUT_PNG_PATH"
    fi

    # Optional Edge-Erode to kill semi-transparent edge fringe
    if [ "$ENABLE_EDGE_ERODE" = true ]; then
        TEMP_ERODED_ALPHA="alpha_eroded_${SIZE}_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_ERODED_ALPHA")
        magick "$OUTPUT_PNG_PATH" -alpha extract \
               -morphology Erode Diamond:2 "$TEMP_ERODED_ALPHA"
        magick "$OUTPUT_PNG_PATH" "$TEMP_ERODED_ALPHA" -compose CopyOpacity -composite "PNG32:$OUTPUT_PNG_PATH"
    fi

    # Verification
    if [[ -f "$OUTPUT_PNG_PATH" ]]; then
        actual_width=$(sips -g pixelWidth "$OUTPUT_PNG_PATH" 2>/dev/null | awk '/pixelWidth/ {print $2}')
        actual_height=$(sips -g pixelHeight "$OUTPUT_PNG_PATH" 2>/dev/null | awk '/pixelHeight/ {print $2}')
        if [[ "$actual_width" -ne "$SIZE" ]] || [[ "$actual_height" -ne "$SIZE" ]]; then
            echo "ERROR [$FILENAME]: Dimension mismatch for $OUTPUT_PNG_PATH! Expected ${SIZE}x${SIZE}, got ${actual_width}x${actual_height}"
        else
            echo "Verified $OUTPUT_PNG_PATH (${actual_width}x${actual_height})"
        fi
    else
        echo "ERROR [$FILENAME]: Failed to generate $OUTPUT_PNG_PATH during loop."
    fi
done # End of main processing loop

echo "All PNGs for .iconset processing loop completed."

# --- Create .icns File ---
echo "Creating $FINAL_ICNS_FILE from $OUTPUT_ICONSET_DIR ($PWD/$OUTPUT_ICONSET_DIR)..."
iconutil --convert icns --output "$FINAL_ICNS_FILE" "$OUTPUT_ICONSET_DIR"

if [ "$DEBUG_STEP" = true ]; then
    DEBUG_ICNS_COPY="./DEBUG_FINAL_ICON.icns"
    if [[ -f "$FINAL_ICNS_FILE" ]]; then
        cp "$FINAL_ICNS_FILE" "$DEBUG_ICNS_COPY"
        echo "DEBUG: Copied final generated icon to '$DEBUG_ICNS_COPY' for inspection."
    else
        echo "ERROR: $FINAL_ICNS_FILE was not created by iconutil (DEBUG_STEP)."
    fi
fi

echo "Successfully created $FINAL_ICNS_FILE (if iconutil succeeded)."

# --- Generate a special 1024x1024 icon without padding for final_icon.png ---
echo "Generating final_icon.png (1024x1024 without padding)..."

FINAL_SIZE=1024
FINAL_PNG="final_icon.png"

# Calculate radius for the full-size icon
RADIUS_PX=$(printf "%.0f" "$(echo "$FINAL_SIZE * $CORNER_RADIUS_PERCENT" | bc -l)")
if [ "$RADIUS_PX" -lt 1 ]; then RADIUS_PX=1; fi
HALF_SIZE=$((FINAL_SIZE / 2))
if [ "$RADIUS_PX" -gt "$HALF_SIZE" ]; then RADIUS_PX=$HALF_SIZE; fi

# Define temporary files for final icon generation
TEMP_FINAL_RESIZED="temp_final_resized_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_RESIZED")
TEMP_FINAL_ROUNDED_MASK="temp_final_mask_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_ROUNDED_MASK")
TEMP_FINAL_GRADIENT="temp_final_gradient_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_GRADIENT")
TEMP_FINAL_WITH_GLOSS="temp_final_gloss_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_WITH_GLOSS")
TEMP_FINAL_INNER_SHADOW="temp_final_inner_shadow_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_INNER_SHADOW")
TEMP_FINAL_WITH_INNER_SHADOW="temp_final_with_inner_shadow_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_WITH_INNER_SHADOW")
TEMP_FINAL_ROUNDED="temp_final_rounded_${RANDOM}.png"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_ROUNDED")

# Step 1: Resize input to full 1024x1024 (no padding)
magick "$INPUT_PNG" -filter LanczosSharp -resize "${FINAL_SIZE}x${FINAL_SIZE}!" "PNG32:$TEMP_FINAL_RESIZED"

# Step 2: Create the rounded corner mask
FINAL_MINUS_1=$((FINAL_SIZE - 1))
magick -size "${FINAL_SIZE}x${FINAL_SIZE}" xc:none -fill white \
    -draw "roundrectangle 0,0,${FINAL_MINUS_1},${FINAL_MINUS_1},${RADIUS_PX},${RADIUS_PX}" \
    "PNG32:$TEMP_FINAL_ROUNDED_MASK"

# Step 3: Apply glossy highlight (if enabled)
if [ "$ENABLE_GLOSS" = true ]; then
    GLOSS_HEIGHT=$(printf "%.0f" "$(echo "$FINAL_SIZE * 0.40" | bc -l)")
    GLOSS_OPACITY_START="0.15"
    magick -size "${FINAL_SIZE}x${GLOSS_HEIGHT}" \
           gradient:"rgba(255,255,255,${GLOSS_OPACITY_START})"-"rgba(255,255,255,0.0)" \
           -gravity North -background None -extent "${FINAL_SIZE}x${FINAL_SIZE}" \
           "PNG32:$TEMP_FINAL_GRADIENT"
    magick "$TEMP_FINAL_RESIZED" "$TEMP_FINAL_GRADIENT" \
           -compose Over -composite "PNG32:$TEMP_FINAL_WITH_GLOSS"
else
    cp "$TEMP_FINAL_RESIZED" "$TEMP_FINAL_WITH_GLOSS"
fi

# Step 4: Apply inner shadow
INNER_SHADOW_COLOR="rgba(0,0,0,0.20)"
INNER_SHADOW_BLUR="0x0.75"
magick "$TEMP_FINAL_ROUNDED_MASK" \
       -morphology EdgeIn Diamond:1 \
       -fill "$INNER_SHADOW_COLOR" -opaque white \
       -fill transparent -opaque black \
       -blur "$INNER_SHADOW_BLUR" \
       "$TEMP_FINAL_INNER_SHADOW"

magick "$TEMP_FINAL_WITH_GLOSS" "$TEMP_FINAL_INNER_SHADOW" \
       -compose Atop -composite "PNG32:$TEMP_FINAL_WITH_INNER_SHADOW"

# Step 5: Apply rounded corners
magick "$TEMP_FINAL_WITH_INNER_SHADOW" "$TEMP_FINAL_ROUNDED_MASK" \
    -compose DstIn -composite "PNG32:$TEMP_FINAL_ROUNDED"

# Step 6: Add drop shadow (for large size)
SHADOW_OPACITY=35
SHADOW_PARAMS="${SHADOW_OPACITY}x5+3+4"

TEMP_FINAL_ALPHA="temp_final_alpha_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_ALPHA")
TEMP_FINAL_SHADOW="temp_final_shadow_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_SHADOW")

magick "$TEMP_FINAL_ROUNDED" -alpha extract "$TEMP_FINAL_ALPHA"
magick "$TEMP_FINAL_ALPHA" \
    -virtual-pixel transparent \
    -background black \
    -shadow "$SHADOW_PARAMS" \
    +repage \
    "$TEMP_FINAL_SHADOW"

# Composite shadow and icon
magick -size "${FINAL_SIZE}x${FINAL_SIZE}" xc:none \
       "$TEMP_FINAL_ROUNDED" -gravity center -compose Over -composite \
       "$TEMP_FINAL_SHADOW" -gravity center -compose DstOver -composite \
       "PNG32:$FINAL_PNG"

# Re-apply the rounded mask to clip shadow
magick "$FINAL_PNG" "$TEMP_FINAL_ROUNDED_MASK" \
       -compose DstIn -composite \
       "PNG32:$FINAL_PNG"

# Optional edge erode
if [ "$ENABLE_EDGE_ERODE" = true ]; then
    TEMP_FINAL_ERODED_ALPHA="temp_final_eroded_alpha_${RANDOM}.miff"; TEMP_FILES_TO_CLEAN+=("$TEMP_FINAL_ERODED_ALPHA")
    magick "$FINAL_PNG" -alpha extract \
           -morphology Erode Diamond:2 "$TEMP_FINAL_ERODED_ALPHA"
    magick "$FINAL_PNG" "$TEMP_FINAL_ERODED_ALPHA" -compose CopyOpacity -composite "PNG32:$FINAL_PNG"
fi

echo "Created $FINAL_PNG (1024x1024 without padding)"

echo "Script finished. ✨"

exit 0