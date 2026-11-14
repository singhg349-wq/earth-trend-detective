import streamlit as st
import json
import os
from pathlib import Path
import pandas as pd
import plotly.express as px

# Contract schema from docs/CONTRACT.md
def validate_artifact(data):
    """Basic validation of artifact schema"""
    required_fields = ["id", "variable", "units", "source", "region", "season", 
                      "years", "values", "coverage", "geometry_file", "template_summary", 
                      "trend", "validation"]
    return all(field in data for field in required_fields)

def load_artifacts():
    """Load artifacts from data/artifacts/, fallback to data/fixtures/"""
    artifacts_dir = Path("data/artifacts")
    fixtures_dir = Path("data/fixtures")
    
    if artifacts_dir.exists() and any(artifacts_dir.iterdir()):
        # Load from artifacts
        artifacts = []
        for json_file in artifacts_dir.glob("*.json"):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    if validate_artifact(data):
                        artifacts.append(data)
            except (json.JSONDecodeError, FileNotFoundError):
                continue
        return artifacts
    else:
        # Fallback to fixtures
        artifacts = []
        for json_file in fixtures_dir.glob("*.json"):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    if validate_artifact(data):
                        artifacts.append(data)
            except (json.JSONDecodeError, FileNotFoundError):
                continue
        return artifacts

def create_result_card(data):
    """Create a result card with chart and metrics"""
    # Create line chart
    df = pd.DataFrame({
        'Year': data['years'],
        'Value': data['values'],
        'Coverage': data['coverage']
    })
    
    fig = px.line(df, x='Year', y='Value', title=f"{data['region']['label']} - {data['variable']}",
                  labels={'Value': f"{data['units']}", 'Year': 'Year'},
                  hover_data=['Coverage'])
    
    # Create metrics
    latest_year = data['years'][-1]
    latest_value = data['values'][-1]
    avg_value = sum(data['values']) / len(data['values'])
    min_value = min(data['values'])
    max_value = max(data['values'])
    years_span = data['years'][-1] - data['years'][0] + 1
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Latest Value", f"{latest_value:.2f} {data['units']}", delta=f"{latest_value - avg_value:+.2f}")
    
    with col2:
        st.metric("Average", f"{avg_value:.2f} {data['units']}")
    
    with col3:
        st.metric("Min", f"{min_value:.2f} {data['units']}")
    
    with col4:
        st.metric("Max", f"{max_value:.2f} {data['units']}")
    
    st.plotly_chart(fig, use_container_width=True)
    
    # Source and coverage info
    st.subheader("Source & Metadata")
    st.write(f"**Product**: {data['source']['product']} {data['source']['version']}")
    st.write(f"**Variable**: {data['source']['var']}")
    st.write(f"**DOI/URL**: {data['source']['doi_or_url']}")
    st.write(f"**Region**: {data['region']['label']} ({data['region']['id']})")
    st.write(f"**Season**: {data['season']['code']} ({data['season']['year_label']})")
    st.write(f"**Coverage Range**: {min(data['coverage']):.1f} - {max(data['coverage']):.1f}")
    st.write(f"**Data Years**: {years_span} ({data['years'][0]}-{data['years'][-1]})")
    
    # Validation status banner
    if data['validation']['status'] != 'passed':
        if data['validation']['status'] == 'fixture':
            st.error("🔧 FIXTURE DATA: Not real results. For UI development only.")
        else:
            st.warning(f"⚠️ VALIDATION STATUS: {data['validation']['status'].upper()}")
    
    # Inference status banner
    if data['trend']['inference']['status'] == 'unavailable':
        st.info("🔍 INFERENCE UNAVAILABLE: Statistical trend analysis not yet available")
    
    st.markdown("---")

def main():
    st.title("Earth System Trend Detective")
    st.write("Compare DJF rainfall trends for Indonesia and Coastal Peru (GPCP 3.3, 1984-2025)")
    
    # Load artifacts
    artifacts = load_artifacts()
    
    # Load index.json for artifact list display
    artifacts_index_path = Path("data/artifacts/index.json")
    if artifacts_index_path.exists():
        with open(artifacts_index_path, 'r') as f:
            artifacts_index = json.load(f)
        st.sidebar.subheader("Available Artifacts")
        st.sidebar.write(f"Total artifacts: {len(artifacts_index.get('artifacts', []))}")
        for artifact_id in artifacts_index.get('artifacts', []):
            st.sidebar.write(f"- {artifact_id}")
    
    if not artifacts:
        st.error("No data found. Please check data/artifacts/ or data/fixtures/ directories.")
        return
    
    # Preset picker
    preset_options = [f"{a['region']['label']} - {a['variable']}" for a in artifacts]
    selected_preset = st.selectbox("Choose a preset:", preset_options)
    selected_artifact = next(a for a in artifacts if f"{a['region']['label']} - {a['variable']}" == selected_preset)
    
    # Create two columns for side-by-side comparison
    col1, col2 = st.columns(2)
    
    # Result A (selected by preset)
    with col1:
        st.subheader("Result A (Preset Selection)")
        create_result_card(selected_artifact)
        
        # Pin A button
        if st.button("Pin Result A", key="pin_a"):
            st.session_state.pinned_a = selected_artifact
            st.success("Result A pinned!")
    
    # Result B (choose from available artifacts)
    with col2:
        st.subheader("Result B (Choose)")
        if st.session_state.get('pinned_a'):
            # Show choices excluding pinned A
            available_artifacts = [a for a in artifacts if a['id'] != st.session_state.pinned_a['id']]
            if available_artifacts:
                b_preset_options = [f"{a['region']['label']} - {a['variable']}" for a in available_artifacts]
                selected_b_preset = st.selectbox("Choose Result B:", b_preset_options, key="b_selector")
                selected_b_artifact = next(a for a in available_artifacts if f"{a['region']['label']} - {a['variable']}" == selected_b_preset)
                create_result_card(selected_b_artifact)
            else:
                st.info("No other artifacts available for comparison")
        else:
            st.info("Please pin Result A first using the 'Pin Result A' button")
    
    # Info section
    st.sidebar.title("About")
    st.sidebar.write("Earth System Trend Detective - NASA Space Apps 2026")
    st.sidebar.write("Compare rainfall trends between Indonesia and Coastal Peru")
    st.sidebar.write("Data: GPCP 3.3 monthly 0.5 degree")
    st.sidebar.write("Period: 1984-2025 (DJF by January year)")

if __name__ == "__main__":
    main()