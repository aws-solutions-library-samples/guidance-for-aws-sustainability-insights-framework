import os
import pandas as pd
from sentence_transformers import util, SentenceTransformer

# Number of product matches to return, this can be modified in caml.construct.ts
num_of_matches = int(os.getenv("NUM_OF_MATCHES", 5))
naics_file = os.getenv("NAICS_CODES_FILE_PATH")
# Pickle file contains product and NAICS code mapping
# Semgrep issue: https://sg.run/bXQW
# Ignore reason: Pickle file provided in repo and not from untrusted source
# nosemgrep
naics_df = pd.read_pickle(naics_file)


def compute_similarity_scores(model, product_list, naics_embeddings):
    prod_embeddings = model.encode(product_list, convert_to_tensor=True)
    cosine_scores = util.pytorch_cos_sim(prod_embeddings, naics_embeddings)
    return cosine_scores


def model_fn(model_dir):
    model = SentenceTransformer(model_dir)
    naics_list = naics_df.naics_desc.values.tolist()
    naics_embeddings = model.encode(naics_list, convert_to_tensor=True)
    return model, naics_embeddings


def predict_fn(data, model_and_naics_embeddings):
    model, naics_embeddings = model_and_naics_embeddings
    product_list = [data.pop("product", data)]
    cosine_scores = compute_similarity_scores(model, product_list, naics_embeddings)
    sorted_cs, indices = cosine_scores.sort(dim=1, descending=True)
    sorted_product_cs = sorted_cs[0].cpu().numpy()
    naics_ix = indices[0].cpu().numpy()
    matches, result = [], {}
    match_counter, index_counter = 0, 0
    while match_counter < num_of_matches and match_counter < len(naics_ix):
        title = naics_df.loc[naics_ix[index_counter], "Title"]
        naicsCode = naics_df.loc[naics_ix[index_counter], "naics_code"]
        beaCode = naics_df.loc[naics_ix[index_counter], "BEA2012"]
        co2ePerDollar = naics_df.loc[naics_ix[index_counter], "eio_co2"]
        confidence = float("{:.3f}".format(sorted_product_cs[index_counter]))
        if result.get(title) is None:
            result[title] = {}
            matches.append(
                {
                    "title": title,
                    "naicsCode": naicsCode,
                    "beaCode": beaCode,
                    "confidence": confidence,
                    "co2ePerDollar": co2ePerDollar,
                }
            )
            match_counter = match_counter + 1
        index_counter = index_counter + 1
    return matches
