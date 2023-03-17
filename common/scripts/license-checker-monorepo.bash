RESULT_FOLDER=./license-checker

rm -rf "${RESULT_FOLDER}"
mkdir -p "${RESULT_FOLDER}"
root=$PWD

find . -name package.json -not -path "*node_modules*" -not -path "*components*" > "${RESULT_FOLDER}"/license-checker.txt

grep -v '^ *#' < "${RESULT_FOLDER}"/license-checker.txt | while IFS= read -r line
do
  fullPath=${line#*./}
  dirPath=${fullPath%package.json*}
  service=$(basename "$dirPath")
  if [ -z "$service" ]; then
    service="main"
  fi
  echo "$service"
  cd "$root"/"$dirPath" && license-checker --csv --out "$root"/license-checker/"$service".csv
done

rm "$root"/license-checker/license-checker.txt

pushd "${RESULT_FOLDER}"

cat $(ls -t ) > largefile.csv

sort largefile.csv | sort | uniq -d

popd
